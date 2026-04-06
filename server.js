const express = require("express");
const cors = require("cors");
const multer = require("multer");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const { WebSocketServer, WebSocket } = require("ws");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrinterTypes, CharacterSet } = require("node-thermal-printer");
const { MongoClient, ServerApiVersion } = require("mongodb");
const {
  WindowsRawDriver,
  createSafePrinter,
  listWindowsPrinters,
} = require("./server/printing/windowsPrinter");
const { createBuildReceiptHtml } = require("./server/printing/receiptHtml");
const { createDispatchReceiptToType } = require("./server/printing/receiptDispatch");
const { buildBillPdfBuffer } = require("./server/pdf/buildBillPdfBuffer");
const { renderBillPdf, buildThermalPdfDocOptions } = require("./server/pdf/renderBillPdf");
const { menuSeedItems } = require("./server/seed/menuSeed");
const cloudinary = require("cloudinary").v2;

const customDriver = new WindowsRawDriver();
const JWT_SECRET = (process.env.JWT_SECRET || "bbq-pos-jwt-secret-2024").trim();


// ── Đường dẫn lưu dữ liệu cho web runtime ──
const BASE_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

const UPLOADS_DIR = path.join(BASE_DIR, "uploads");
const LEGACY_UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// React build luôn nằm cùng cấp server.js (trong asar hoặc dev)
const UI_BUILD = path.join(__dirname, "pos-ui", "build");

const app = express();
const server = http.createServer(app);
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));
if (LEGACY_UPLOADS_DIR !== UPLOADS_DIR && fs.existsSync(LEGACY_UPLOADS_DIR)) {
  // Fallback ảnh cũ sau khi chuyển dữ liệu sang userData
  app.use("/uploads", express.static(LEGACY_UPLOADS_DIR));
}

// Debug helper: kiểm tra file upload có tồn tại trên server không
app.get("/debug/uploads", (req, res) => {
  const file = String(req.query.file || "").trim();
  if (!file) return res.status(400).json({ error: "Missing ?file=" });
  const fullPath = path.join(UPLOADS_DIR, file);
  res.json({
    file,
    exists: fs.existsSync(fullPath),
    uploadsDir: UPLOADS_DIR,
    baseDir: BASE_DIR,
  });
});

// Serve React build nếu tồn tại (production)
if (fs.existsSync(UI_BUILD)) {
  app.use(express.static(UI_BUILD));
  console.log("✅ Serving UI từ:", UI_BUILD);
}

// =============================================
// MULTER – ảnh menu (memory → Cloudinary hoặc ghi disk)
// =============================================
function isCloudinaryConfigured() {
  const n = (process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const k = (process.env.CLOUDINARY_API_KEY || "").trim();
  const s = (process.env.CLOUDINARY_API_SECRET || "").trim();
  return Boolean(n && k && s);
}

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
    api_key: (process.env.CLOUDINARY_API_KEY || "").trim(),
    api_secret: (process.env.CLOUDINARY_API_SECRET || "").trim(),
  });
}

function safeMenuImageFilename(originalName) {
  const original = String(originalName || "image");
  const ext = path.extname(original).toLowerCase() || ".jpg";
  const safeBase = path
    .basename(original, path.extname(original))
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
  const finalExt = ext && ext.length <= 10 ? ext : ".jpg";
  return `${Date.now()}-${safeBase}${finalExt}`;
}

async function persistMenuImage(file) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) return "";
  if (isCloudinaryConfigured()) {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "posextra-menu", resource_type: "image" },
        (err, r) => (err ? reject(err) : resolve(r))
      );
      stream.end(file.buffer);
    });
    return String(result.secure_url || result.url || "").trim();
  }
  const name = safeMenuImageFilename(file.originalname);
  await fs.promises.writeFile(path.join(UPLOADS_DIR, name), file.buffer);
  return name;
}

const menuUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

let mongoClient = null;
let mongoDb = null;
let mongoReady = false;
let mongoConnectPromise = null;
let settingsCache = {};
let printersCache = [];
/** Cache JSON trả về GET /menu (thực đơn ít đổi — giảm tải Mongo khi nhiều client). */
let menuListCache = null;
let menuListCacheAt = 0;
const MENU_LIST_CACHE_TTL_MS = Math.max(5000, Number(process.env.MENU_LIST_CACHE_TTL_MS || 60000));
function invalidateMenuListCache() {
  menuListCache = null;
  menuListCacheAt = 0;
}
const PRINT_BRIDGE_SECRET = (process.env.PRINT_BRIDGE_SECRET || "bbq-pos-bridge-secret-2024").trim();
const PRINT_DISPATCH_MODE = (process.env.PRINT_DISPATCH_MODE || "queue").trim().toLowerCase();
const bridgeClients = new Set();
const posClients = new Map(); // userId => Set<WebSocket>

function makeSessionId() {
  return Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

function addPosClient(userId, ws) {
  const key = String(userId);
  if (!posClients.has(key)) posClients.set(key, new Set());
  posClients.get(key).add(ws);
}

function removePosClient(userId, ws) {
  const key = String(userId);
  const set = posClients.get(key);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) posClients.delete(key);
}

function notifyForceLogout(userId, reason = "Phiên đăng nhập đã được thay thế ở thiết bị khác") {
  const set = posClients.get(String(userId));
  if (!set) return;
  const payload = JSON.stringify({ event: "FORCE_LOGOUT", reason });
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

async function authMiddleware(req, res, next) {
  try {
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Chưa đăng nhập" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await mongoDb.collection("users").findOne({
      sqlite_id: Number(decoded.id),
      is_active: { $ne: 0 },
    });
    if (!user) return res.status(401).json({ error: "Tài khoản không tồn tại hoặc đã bị khóa" });
    const tokenSid = String(decoded.session_id || "");
    const tokenSv = Number(decoded.session_version || 0);
    const activeSid = String(user.active_session_id || "");
    const activeSv = Number(user.session_version || 0);
    if (!tokenSid || tokenSid !== activeSid || tokenSv !== activeSv) {
      return res.status(401).json({ error: "Phiên đăng nhập đã hết hiệu lực" });
    }
    req.user = {
      id: Number(user.sqlite_id || 0),
      username: user.username,
      role: user.role || "staff",
      full_name: user.full_name || user.username,
      session_id: tokenSid,
      session_version: tokenSv,
      raw: user,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Token không hợp lệ hoặc đã hết hạn" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Không có quyền thực hiện thao tác này" });
    }
    next();
  };
}

// =============================================
// WEBSOCKET – Print Bridge (/bridge)
// =============================================
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const rawUrl = req.url || "";
  const onlyPath = rawUrl.split("?")[0];
  if (onlyPath === "/pos") {
    try {
      const token = rawUrl.match(/[?&]token=([^&]+)/)?.[1];
      if (!token) {
        ws.close(1008, "Unauthorized");
        return;
      }
      const decoded = jwt.verify(decodeURIComponent(token), JWT_SECRET);
      ws.userId = Number(decoded.id || 0);
      ws.sessionId = String(decoded.session_id || "");
      if (!ws.userId || !ws.sessionId) {
        ws.close(1008, "Unauthorized");
        return;
      }
      addPosClient(ws.userId, ws);
      ws.on("close", () => removePosClient(ws.userId, ws));
      ws.on("error", () => removePosClient(ws.userId, ws));
      return;
    } catch {
      ws.close(1008, "Unauthorized");
      return;
    }
  }
  if (onlyPath !== "/bridge") {
    ws.close(1008, "Unknown path");
    return;
  }
  const secret = rawUrl.match(/[?&]secret=([^&]+)/)?.[1];
  if (secret !== PRINT_BRIDGE_SECRET) {
    ws.close(1008, "Unauthorized");
    return;
  }
  bridgeClients.add(ws);
  console.log(`✅ Print Bridge kết nối. Tổng: ${bridgeClients.size}`);
  ws.on("close", () => {
    bridgeClients.delete(ws);
    console.log(`⚠️  Print Bridge ngắt. Còn: ${bridgeClients.size}`);
  });
  ws.on("error", () => {
    bridgeClients.delete(ws);
  });
});

function broadcastToBridges(payload) {
  const message = JSON.stringify(payload);
  for (const ws of bridgeClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

async function connectMongoIfConfigured() {
  const uri = (process.env.MONGODB_URI || process.env.MONGO_URL || "").trim();
  if (!uri) {
    console.log("ℹ️  Chưa cấu hình MONGODB_URI/MONGO_URL (Mongo-only).");
    return;
  }
  mongoClient = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  await mongoClient.connect();
  const dbName = (process.env.MONGODB_DB || process.env.MONGO_DB_NAME || "posextra").trim();
  mongoDb = mongoClient.db(dbName);
  mongoReady = true;
  console.log(`✅ MongoDB connected: ${dbName}`);
}

async function ensureMongoReady() {
  if (mongoReady) return true;
  // Nếu đang connect thì chờ cho xong.
  if (mongoConnectPromise) {
    await mongoConnectPromise;
    return mongoReady;
  }
  const uri = (process.env.MONGODB_URI || process.env.MONGO_URL || "").trim();
  if (!uri) return false;

  mongoConnectPromise = connectMongoIfConfigured()
    .catch((e) => {
      console.error("❌ Mongo connect failed:", e.message);
      return false;
    })
    .finally(() => {
      mongoConnectPromise = null;
    });

  await mongoConnectPromise;
  return mongoReady;
}

async function loadSettingsCache() {
  const docs = await mongoDb.collection("settings").find({}).toArray();
  const next = {};
  docs.forEach((d) => {
    next[d.key] = d.value;
  });
  settingsCache = next;
}

async function refreshPrintersCache() {
  const docs = await mongoDb.collection("windows_printers").find({}).toArray();
  printersCache = docs.map((d) => ({
    id: Number(d.sqlite_id ?? d.id ?? 0),
    name: d.name,
    type: d.type || "ALL",
    paper_size: Number(d.paper_size || 80),
    is_enabled: d.is_enabled !== undefined ? Number(d.is_enabled) : 1,
  }));
}

async function getNextMongoId(collectionName) {
  const col = mongoDb.collection(collectionName);
  const docs = await col
    .find({})
    .project({ sqlite_id: 1, id: 1 })
    .sort({ sqlite_id: -1 })
    .limit(1)
    .toArray();
  const maxVal = docs[0]
    ? Number(docs[0].sqlite_id ?? docs[0].id ?? 0)
    : 0;
  return maxVal + 1;
}

async function seedMongoMenuIfEmpty() {
  if (!mongoReady) return;
  const col = mongoDb.collection("menu");
  const count = await col.countDocuments();
  if (count > 0) return;
  await col.insertMany(
    menuSeedItems.map((item, idx) => ({
      sqlite_id: idx + 1,
      name: item.name,
      price: Number(item.price),
      type: item.type,
      image: "",
    }))
  );
  console.log(`🌱 Mongo menu seed executed: ${menuSeedItems.length} món`);
}

async function ensureAuthBootstrap() {
  const col = mongoDb.collection("users");
  await col.createIndex({ username: 1 }, { unique: true });
  const admin = await col.findOne({ username: "admin" });
  if (!admin) {
    const id = await getNextMongoId("users");
    const hash = await bcrypt.hash("admin123", 10);
    await col.insertOne({
      sqlite_id: id,
      username: "admin",
      password_hash: hash,
      role: "admin",
      full_name: "Administrator",
      is_active: 1,
      session_version: 0,
      active_session_id: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    console.log("👤 Tạo tài khoản admin mặc định: admin / admin123");
  }
  const staff = await col.findOne({ username: "staff" });
  if (!staff) {
    const id = await getNextMongoId("users");
    const hash = await bcrypt.hash("staff123", 10);
    await col.insertOne({
      sqlite_id: id,
      username: "staff",
      password_hash: hash,
      role: "staff",
      full_name: "Nhân viên",
      is_active: 1,
      session_version: 0,
      active_session_id: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    console.log("👤 Tạo tài khoản staff mặc định: staff / staff123");
  }
}

async function ensureMongoIndexes() {
  if (!mongoReady) return;
  try {
    await Promise.all([
      mongoDb.collection("menu").createIndex({ sqlite_id: 1 }, { unique: true }),
      mongoDb.collection("users").createIndex({ sqlite_id: 1 }, { unique: true }),
    ]);
  } catch {
    // collection rỗng / trùng key — bỏ qua, không chặn boot
  }
}

/**
 * Mongo-only boot:
 * - connect Mongo
 * - seed menu (nếu collection rỗng)
 * - đảm bảo settings & order_session có doc mặc định
 * - start Express
 */
async function initMongoOnly() {
  await connectMongoIfConfigured();
  if (!mongoReady) {
    console.error("❌ Chưa có MONGODB_URI/MONGODB_DB (bỏ SQLite), dừng server.");
    process.exit(1);
  }

  await seedMongoMenuIfEmpty();
  await ensureAuthBootstrap();
  await ensureMongoIndexes();

  // Default settings để UI không bị undefined
  const defaultSettings = [
    ["printer_ip", ""],
    ["printer_type", ""],
    ["store_name", ""],
    ["store_address", ""],
    ["store_phone", ""],
    ["cashier_name", ""],
    ["total_tables", "20"],
    ["bill_css_override", ""],
  ];
  const settingsCol = mongoDb.collection("settings");
  await Promise.all(
    defaultSettings.map(([key, value]) =>
      settingsCol.updateOne({ key }, { $set: { key, value } }, { upsert: true })
    )
  );

  // order_session mặc định
  await mongoDb.collection("order_session").updateOne(
    { id: 1 },
    {
      $set: {
        id: 1,
        payload: JSON.stringify({ tableOrders: {}, itemNotes: {}, kitchenSent: {} }),
      },
    },
    { upsert: true }
  );

  await loadSettingsCache();
  await refreshPrintersCache();

  console.log("📁 BASE_DIR:", BASE_DIR);
  console.log("📁 UPLOADS_DIR:", UPLOADS_DIR);
  console.log(
    isCloudinaryConfigured()
      ? "☁️  Ảnh menu: Cloudinary"
      : "📂 Ảnh menu: lưu local (DATA_DIR/uploads)"
  );

  startServer();
}

// =============================================
// MENU APIs
// =============================================

/** Giá menu lưu cent. Form có thể gửi "2690" (cent) hoặc "26,90" / "26.90" (euro). */
function parseMenuPriceToCents(v) {
  if (v == null || v === "") return 0;
  const s = String(v).trim().replace(/\s/g, "");
  if (!s) return 0;
  if (/[.,]/.test(s)) {
    const n = parseFloat(s.replace(",", "."));
    return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function startServer() {
  // =============================================
  // AUTH APIs
  // =============================================
  app.post("/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: "Thiếu username/password" });
      const user = await mongoDb.collection("users").findOne({
        username: String(username).trim(),
        is_active: { $ne: 0 },
      });
      if (!user) return res.status(401).json({ error: "Tài khoản không tồn tại hoặc đã bị khóa" });
      const ok = await bcrypt.compare(String(password), String(user.password_hash || ""));
      if (!ok) return res.status(401).json({ error: "Mật khẩu không đúng" });

      const previousSessionId = String(user.active_session_id || "");
      const sessionVersion = Number(user.session_version || 0) + 1;
      const sessionId = makeSessionId();
      await mongoDb.collection("users").updateOne(
        { sqlite_id: Number(user.sqlite_id) },
        {
          $set: {
            session_version: sessionVersion,
            active_session_id: sessionId,
            updated_at: new Date().toISOString(),
          },
        }
      );
      if (previousSessionId) {
        notifyForceLogout(user.sqlite_id, "Tài khoản đã đăng nhập trên thiết bị khác");
      }
      const token = jwt.sign(
        {
          id: Number(user.sqlite_id),
          username: user.username,
          role: user.role || "staff",
          full_name: user.full_name || user.username,
          session_id: sessionId,
          session_version: sessionVersion,
        },
        JWT_SECRET,
        { expiresIn: "12h" }
      );
      return res.json({
        token,
        user: {
          id: Number(user.sqlite_id),
          username: user.username,
          role: user.role || "staff",
          full_name: user.full_name || user.username,
        },
      });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.get("/auth/me", authMiddleware, (req, res) => {
    res.json({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      full_name: req.user.full_name,
    });
  });

  app.post("/auth/logout", authMiddleware, async (req, res) => {
    try {
      await mongoDb.collection("users").updateOne(
        { sqlite_id: req.user.id },
        {
          $set: {
            active_session_id: "",
            session_version: Number(req.user.session_version || 0) + 1,
            updated_at: new Date().toISOString(),
          },
        }
      );
      notifyForceLogout(req.user.id, "Bạn đã đăng xuất");
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  });

  // =============================================
  // USER MANAGEMENT APIs (admin)
  // =============================================
  app.get("/users", authMiddleware, requireRole("admin"), async (req, res) => {
    try {
      const rows = await mongoDb
        .collection("users")
        .find({})
        .sort({ sqlite_id: 1 })
        .project({
          _id: 0,
          id: "$sqlite_id",
          username: 1,
          role: 1,
          full_name: 1,
          is_active: 1,
          created_at: 1,
        })
        .toArray();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/users", authMiddleware, requireRole("admin"), async (req, res) => {
    try {
      const { username, password, role, full_name } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: "Thiếu username/password" });
      }
      const safeRole = String(role || "staff").toLowerCase();
      if (!["admin", "staff"].includes(safeRole)) {
        return res.status(400).json({ error: "Role không hợp lệ" });
      }
      const exist = await mongoDb.collection("users").findOne({ username: String(username).trim() });
      if (exist) return res.status(409).json({ error: "Username đã tồn tại" });
      const nextId = await getNextMongoId("users");
      const hash = await bcrypt.hash(String(password), 10);
      await mongoDb.collection("users").insertOne({
        sqlite_id: nextId,
        username: String(username).trim(),
        password_hash: hash,
        role: safeRole,
        full_name: String(full_name || username).trim(),
        is_active: 1,
        session_version: 0,
        active_session_id: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      res.json({ created: true, id: nextId });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.put("/users/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { full_name, role, is_active, password } = req.body || {};
      const patch = { updated_at: new Date().toISOString() };
      if (full_name !== undefined) patch.full_name = String(full_name || "").trim();
      if (role !== undefined) {
        const safeRole = String(role).toLowerCase();
        if (!["admin", "staff"].includes(safeRole)) {
          return res.status(400).json({ error: "Role không hợp lệ" });
        }
        patch.role = safeRole;
      }
      if (is_active !== undefined) patch.is_active = is_active ? 1 : 0;
      if (password) patch.password_hash = await bcrypt.hash(String(password), 10);

      const before = await mongoDb.collection("users").findOne({ sqlite_id: id });
      if (!before) return res.status(404).json({ error: "Không tìm thấy user" });
      const roleChanged = patch.role && patch.role !== before.role;
      const disabled = patch.is_active === 0 && Number(before.is_active) !== 0;
      const resetSession = Boolean(password) || roleChanged || disabled;
      if (resetSession) {
        patch.session_version = Number(before.session_version || 0) + 1;
        patch.active_session_id = "";
      }
      await mongoDb.collection("users").updateOne({ sqlite_id: id }, { $set: patch });
      if (resetSession) notifyForceLogout(id, "Tài khoản của bạn vừa được cập nhật bởi admin");
      res.json({ updated: true });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.delete("/users/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (id === Number(req.user.id)) {
        return res.status(400).json({ error: "Không thể xóa chính mình" });
      }
      const user = await mongoDb.collection("users").findOne({ sqlite_id: id });
      if (!user) return res.status(404).json({ error: "Không tìm thấy user" });
      if (String(user.username) === "admin" && String(req.user.username) !== "admin") {
        return res.status(403).json({ error: "Không thể xóa tài khoản admin mặc định" });
      }
      await mongoDb.collection("users").deleteOne({ sqlite_id: id });
      notifyForceLogout(id, "Tài khoản đã bị xóa");
      res.json({ deleted: true });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Lấy toàn bộ menu
  app.get("/menu", authMiddleware, async (req, res) => {
    try {
      const now = Date.now();
      if (menuListCache && now - menuListCacheAt < MENU_LIST_CACHE_TTL_MS) {
        res.set("Cache-Control", "private, max-age=60");
        return res.json(menuListCache);
      }
      const docs = await mongoDb
        .collection("menu")
        .find({})
        .project({ sqlite_id: 1, name: 1, price: 1, type: 1, image: 1, kitchen_category: 1 })
        .sort({ sqlite_id: 1 })
        .toArray();
      const payload = docs.map((d) => {
        const type = d.type || "FOOD";
        const kitchen =
          type === "DRINK"
            ? d.kitchen_category || ""
            : d.kitchen_category || "MAIN";
        return {
          id: Number(d.sqlite_id ?? d.id ?? 0),
          name: d.name || "",
          price: Number(d.price || 0),
          type,
          image: d.image || "",
          kitchen_category: kitchen,
        };
      });
      menuListCache = payload;
      menuListCacheAt = now;
      res.set("Cache-Control", "private, max-age=60");
      res.json(payload);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Thêm món mới
  app.post("/menu", authMiddleware, requireRole("admin"), menuUpload.single("image"), async (req, res) => {
    const { name, price, type, kitchen_category } = req.body;
    try {
      let imageValue = "";
      if (req.file?.buffer) {
        try {
          imageValue = await persistMenuImage(req.file);
        } catch (upErr) {
          return res.status(500).json({
            error: upErr.message || String(upErr) || "Upload ảnh thất bại",
          });
        }
      }
      const nextId = await getNextMongoId("menu");
      const itemType = type || "FOOD";
      const doc = {
        sqlite_id: nextId,
        name: name || "",
        price: parseMenuPriceToCents(price),
        type: itemType,
      };
      if (itemType !== "DRINK") {
        const k = String(kitchen_category || "MAIN")
          .trim()
          .slice(0, 64);
        doc.kitchen_category = k || "MAIN";
      }
      if (imageValue) doc.image = imageValue;
      await mongoDb.collection("menu").insertOne(doc);
      invalidateMenuListCache();
      const isUrl = /^https?:\/\//i.test(imageValue);
      res.json({
        added: true,
        mongoSaved: true,
        mongoError: null,
        imageProvided: Boolean(imageValue),
        imageFilename: isUrl ? null : imageValue || null,
        imageUrl: isUrl ? imageValue : null,
      });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Cập nhật món
  app.put("/menu/:id", authMiddleware, requireRole("admin"), menuUpload.single("image"), async (req, res) => {
    const { name, price, type, kitchen_category } = req.body;
    const { id } = req.params;
    try {
      let imageValue = "";
      if (req.file?.buffer) {
        try {
          imageValue = await persistMenuImage(req.file);
        } catch (upErr) {
          return res.status(500).json({
            error: upErr.message || String(upErr) || "Upload ảnh thất bại",
          });
        }
      }
      const itemType = type || "FOOD";
      const patch = {
        name: name || "",
        price: parseMenuPriceToCents(price),
        type: itemType,
      };
      if (imageValue) patch.image = imageValue;
      const updateOps = { $set: patch };
      if (itemType === "DRINK") {
        updateOps.$unset = { kitchen_category: "" };
      } else {
        const k = String(kitchen_category || "MAIN")
          .trim()
          .slice(0, 64);
        patch.kitchen_category = k || "MAIN";
      }
      const result = await mongoDb.collection("menu").updateOne(
        { sqlite_id: Number(id) },
        updateOps
      );
      if (result.matchedCount === 0) return res.status(404).json({ error: "Không tìm thấy món" });
      invalidateMenuListCache();
      const isUrl = /^https?:\/\//i.test(imageValue);
      res.json({
        updated: true,
        mongoSaved: true,
        mongoError: null,
        imageProvided: Boolean(imageValue),
        imageFilename: isUrl ? null : imageValue || null,
        imageUrl: isUrl ? imageValue : null,
      });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Xóa món
  app.delete("/menu/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    try {
      const result = await mongoDb.collection("menu").deleteOne({ sqlite_id: Number(req.params.id) });
      if (result.deletedCount === 0) return res.status(404).json({ error: "Không tìm thấy món" });
      invalidateMenuListCache();
      res.json({ deleted: true, mongoSaved: true, mongoError: null });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // =============================================
  // ORDER SESSION (đơn đang order — lưu DB)
  // =============================================

  app.get("/order-session", authMiddleware, async (req, res) => {
    const row = await mongoDb.collection("order_session").findOne({ id: 1 });
    const empty = { tableOrders: {}, itemNotes: {}, kitchenSent: {} };
    if (!row?.payload) return res.json(empty);
    try {
      const p = JSON.parse(row.payload);
      res.json({
        tableOrders: p.tableOrders && typeof p.tableOrders === "object" ? p.tableOrders : {},
        itemNotes: p.itemNotes && typeof p.itemNotes === "object" ? p.itemNotes : {},
        kitchenSent: p.kitchenSent && typeof p.kitchenSent === "object" ? p.kitchenSent : {},
      });
    } catch {
      res.json(empty);
    }
  });

  app.put("/order-session", authMiddleware, async (req, res) => {
    const { tableOrders = {}, itemNotes = {}, kitchenSent = {} } = req.body || {};
    const payload = JSON.stringify({ tableOrders, itemNotes, kitchenSent });
    await mongoDb.collection("order_session").updateOne(
      { id: 1 },
      { $set: { id: 1, payload } },
      { upsert: true }
    );
    res.json({ ok: true });
  });

  // =============================================
  // TABLE STATUS APIs
  // =============================================

  // Lấy trạng thái tất cả bàn
  app.get("/tables", authMiddleware, async (req, res) => {
    try {
      const docs = await mongoDb.collection("tables").find({}).sort({ table_num: 1 }).toArray();
      res.json(
        docs.map((d) => ({
          table_num: Number(d.table_num),
          status: d.status || "PAID",
        }))
      );
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Cập nhật trạng thái bàn
  app.post("/tables/:num/status", authMiddleware, requireRole("admin", "staff"), async (req, res) => {
    const { num } = req.params;
    const { status } = req.body;
    try {
      await mongoDb.collection("tables").updateOne(
        { table_num: Number(num) },
        { $set: { table_num: Number(num), status: status || "PAID" } },
        { upsert: true }
      );
      res.json({ updated: true });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Thêm bàn mới
  app.post("/tables", authMiddleware, requireRole("admin"), async (req, res) => {
    const { table_num } = req.body;
    if (!table_num) return res.status(400).json({ error: "Thiếu số bàn" });

    try {
      const existing = await mongoDb.collection("tables").findOne({ table_num: Number(table_num) });
      if (existing) return res.status(409).json({ error: "Bàn đã tồn tại" });
      await mongoDb.collection("tables").insertOne({ table_num: Number(table_num), status: "PAID" });
      res.json({ added: true, table_num: Number(table_num) });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Đổi số bàn
  app.put("/tables/:num", authMiddleware, requireRole("admin"), async (req, res) => {
    const oldNum = Number(req.params.num);
    const { new_num } = req.body;
    if (!new_num) return res.status(400).json({ error: "Thiếu số bàn mới" });

    try {
      const existing = await mongoDb.collection("tables").findOne({ table_num: Number(new_num) });
      if (existing) return res.status(409).json({ error: `Bàn ${new_num} đã tồn tại` });

      const result = await mongoDb.collection("tables").updateMany(
        { table_num: oldNum },
        { $set: { table_num: Number(new_num) } }
      );

      if (result.matchedCount === 0) return res.status(404).json({ error: "Không tìm thấy bàn" });
      res.json({ updated: true });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Xóa bàn
  app.delete("/tables/:num", authMiddleware, requireRole("admin"), async (req, res) => {
    const num = Number(req.params.num);
    try {
      const busy = await mongoDb.collection("tables").findOne({ table_num: num, status: "OPEN" });
      if (busy) return res.status(400).json({ error: "Bàn đang có khách, không thể xóa" });
      const result = await mongoDb.collection("tables").deleteOne({ table_num: num });
      if (result.deletedCount === 0) return res.status(404).json({ error: "Không tìm thấy bàn" });
      res.json({ deleted: true });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // =============================================
  // BILLS APIs
  // =============================================

  /** Mongo có thể lưu sqlite_id / bill_id dạng number hoặc string */
  function mongoBillBySqliteId(billId) {
    const n = Number(billId);
    return { $or: [{ sqlite_id: n }, { sqlite_id: String(n) }] };
  }
  function mongoItemsByBillId(billId) {
    const n = Number(billId);
    return { $or: [{ bill_id: n }, { bill_id: String(n) }] };
  }

  // Tạo hóa đơn mới
  app.post("/bills", authMiddleware, requireRole("admin"), async (req, res) => {
    const { table_num, total, items } = req.body || {};
    if (!table_num) return res.status(400).json({ error: "Thiếu table_num" });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Danh sách món không hợp lệ" });

    const now = new Date().toLocaleString("sv-SE").replace("T", " "); // "YYYY-MM-DD HH:MM:SS"
    try {
      const billId = await getNextMongoId("bills");
      await mongoDb.collection("bills").insertOne({
        sqlite_id: billId,
        table_num: Number(table_num),
        total: Number(total || 0),
        created_at: now,
      });

      // bill_items
      const nextItemId = await getNextMongoId("bill_items");
      const billItems = items.map((item, idx) => ({
        sqlite_id: nextItemId + idx,
        bill_id: billId,
        name: item.name || "",
        price: Number(item.price || 0),
        qty: Number(item.qty || 0),
        item_type: item.type || null,
      }));
      if (billItems.length) {
        await mongoDb.collection("bill_items").insertMany(billItems);
      }

      // Đánh dấu bàn PAID
      await mongoDb.collection("tables").updateOne(
        { table_num: Number(table_num) },
        { $set: { table_num: Number(table_num), status: "PAID" } },
        { upsert: true }
      );

      res.json({ bill_id: billId });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Lịch sử hóa đơn theo ngày
  app.get("/bills", authMiddleware, requireRole("admin"), async (req, res) => {
    const date = req.query.date || new Date().toISOString().split("T")[0];
    try {
      const bills = await mongoDb.collection("bills")
        .find({ created_at: { $regex: `^${date}` } })
        .sort({ created_at: -1 })
        .toArray();

      if (!bills.length) return res.json([]);

      const billIds = bills.map((b) => Number(b.sqlite_id ?? b.id ?? 0)).filter(Boolean);
      const billIdKeys = [...new Set(billIds.flatMap((id) => [id, String(id)]))];
      const itemsDocs = await mongoDb.collection("bill_items")
        .find({ bill_id: { $in: billIdKeys } })
        .sort({ sqlite_id: 1 })
        .toArray();

      const map = {};
      itemsDocs.forEach((it) => {
        const bid = Number(it.bill_id);
        if (!map[bid]) map[bid] = [];
        map[bid].push(`${it.name || ""} x${Number(it.qty || 0)}`);
      });

      const rows = bills.map((b) => {
        const id = Number(b.sqlite_id ?? b.id ?? 0);
        return {
          id,
          table_num: Number(b.table_num || 0),
          total: Number(b.total || 0),
          created_at: b.created_at || "",
          items_summary: (map[id] || []).join(", "),
        };
      });

      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Chi tiết 1 hóa đơn
  app.get("/bills/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    const { id } = req.params;
    const billId = Number(id);
    try {
      const bill = await mongoDb.collection("bills").findOne(mongoBillBySqliteId(billId));
      if (!bill) return res.status(404).json({ error: "Not found" });
      const items = await mongoDb.collection("bill_items")
        .find(mongoItemsByBillId(billId))
        .sort({ sqlite_id: 1 })
        .toArray();

      res.json({
        id: Number(bill.sqlite_id ?? bill.id ?? billId),
        table_num: Number(bill.table_num || 0),
        total: Number(bill.total || 0),
        created_at: bill.created_at || "",
        items: items.map((it) => ({
          id: Number(it.sqlite_id ?? it.id ?? 0),
          bill_id: Number(it.bill_id || 0),
          name: it.name || "",
          price: Number(it.price || 0),
          qty: Number(it.qty || 0),
          item_type: it.item_type ?? null,
        })),
      });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // =============================================
  // THỐNG KÊ DOANH THU
  // =============================================

  // Doanh thu theo ngày trong tháng
  app.get("/stats/daily", authMiddleware, requireRole("admin"), async (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    try {
      const bills = await mongoDb.collection("bills")
        .find({ created_at: { $regex: `^${month}-` } })
        .sort({ created_at: 1 })
        .toArray();

      const map = {};
      bills.forEach((b) => {
        const day = (b.created_at || "").slice(0, 10);
        if (!day) return;
        if (!map[day]) map[day] = { date: day, bill_count: 0, revenue: 0 };
        map[day].bill_count += 1;
        map[day].revenue += Number(b.total || 0);
      });

      const rows = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Stats theo tháng (gộp theo ngày trong tháng đó)
  app.get("/stats/monthly", authMiddleware, requireRole("admin"), async (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    try {
      const bills = await mongoDb.collection("bills")
        .find({ created_at: { $regex: `^${month}-` } })
        .sort({ created_at: 1 })
        .toArray();

      const dayMap = {};
      let revenue = 0;
      bills.forEach((b) => {
        const day = (b.created_at || "").slice(0, 10);
        if (!day) return;
        if (!dayMap[day]) dayMap[day] = { date: day, bill_count: 0, revenue: 0 };
        dayMap[day].bill_count += 1;
        dayMap[day].revenue += Number(b.total || 0);
        revenue += Number(b.total || 0);
      });

      const days = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));

      const billIds = bills.map((b) => Number(b.sqlite_id ?? b.id ?? 0)).filter(Boolean);
      let topItems = [];
      if (billIds.length) {
        const items = await mongoDb.collection("bill_items")
          .find({ bill_id: { $in: billIds } })
          .toArray();

        const itemMap = {};
        items.forEach((it) => {
          const name = it.name || "";
          if (!itemMap[name]) itemMap[name] = { name, total_qty: 0, total_revenue: 0 };
          itemMap[name].total_qty += Number(it.qty || 0);
          itemMap[name].total_revenue += Number(it.price || 0) * Number(it.qty || 0);
        });
        topItems = Object.values(itemMap)
          .sort((a, b) => b.total_qty - a.total_qty)
          .slice(0, 5);
      }

      res.json({
        bill_count: bills.length,
        revenue,
        days,
        top_items: topItems,
      });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Stats theo năm (gộp theo tháng)
  app.get("/stats/yearly", authMiddleware, requireRole("admin"), async (req, res) => {
    const year = req.query.year || new Date().getFullYear().toString();
    try {
      const bills = await mongoDb.collection("bills")
        .find({ created_at: { $regex: `^${year}-` } })
        .sort({ created_at: 1 })
        .toArray();

      const monthMap = {};
      let revenue = 0;
      bills.forEach((b) => {
        const ym = (b.created_at || "").slice(0, 7);
        if (!ym) return;
        if (!monthMap[ym]) monthMap[ym] = { month: ym, bill_count: 0, revenue: 0 };
        monthMap[ym].bill_count += 1;
        monthMap[ym].revenue += Number(b.total || 0);
        revenue += Number(b.total || 0);
      });

      const months = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

      const billIds = bills.map((b) => Number(b.sqlite_id ?? b.id ?? 0)).filter(Boolean);
      let topItems = [];
      if (billIds.length) {
        const items = await mongoDb.collection("bill_items")
          .find({ bill_id: { $in: billIds } })
          .toArray();

        const itemMap = {};
        items.forEach((it) => {
          const name = it.name || "";
          if (!itemMap[name]) itemMap[name] = { name, total_qty: 0, total_revenue: 0 };
          itemMap[name].total_qty += Number(it.qty || 0);
          itemMap[name].total_revenue += Number(it.price || 0) * Number(it.qty || 0);
        });
        topItems = Object.values(itemMap)
          .sort((a, b) => b.total_qty - a.total_qty)
          .slice(0, 5);
      }

      res.json({
        bill_count: bills.length,
        revenue,
        months,
        top_items: topItems,
      });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Tổng quan hôm nay
  app.get("/stats/today", authMiddleware, requireRole("admin"), async (req, res) => {
    const today = new Date().toISOString().split("T")[0];
    try {
      const bills = await mongoDb.collection("bills")
        .find({ created_at: { $regex: `^${today}` } })
        .toArray();

      const bill_count = bills.length;
      const revenue = bills.reduce((s, b) => s + Number(b.total || 0), 0);

      const billIds = bills.map((b) => Number(b.sqlite_id ?? b.id ?? 0)).filter(Boolean);
      let topItems = [];
      if (billIds.length) {
        const items = await mongoDb.collection("bill_items")
          .find({ bill_id: { $in: billIds } })
          .toArray();

        const itemMap = {};
        items.forEach((it) => {
          const name = it.name || "";
          if (!itemMap[name]) itemMap[name] = { name, total_qty: 0, total_revenue: 0 };
          itemMap[name].total_qty += Number(it.qty || 0);
          itemMap[name].total_revenue += Number(it.price || 0) * Number(it.qty || 0);
        });
        topItems = Object.values(itemMap)
          .sort((a, b) => b.total_qty - a.total_qty)
          .slice(0, 5);
      }

      res.json({ bill_count, revenue, top_items: topItems });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // =============================================
  // PRINTER CONFIG
  // =============================================

  function getPrinterIP() {
    const v = settingsCache.printer_ip;
    return v && String(v).trim() ? String(v).trim() : "";
  }

  function getSetting(key, fallback = "") {
    const value = settingsCache[key];
    return value && String(value).trim() ? String(value).trim() : fallback;
  }

  function getStoreProfile() {
    const storeName = getSetting("store_name", "POS STORE");
    const storeAddress = getSetting("store_address", "");
    const storePhone = getSetting("store_phone", "");
    const cashierName = getSetting("cashier_name", "Nhân viên");
    const subtitleParts = [storeAddress, storePhone ? `Hotline ${storePhone}` : ""].filter(Boolean);
    return {
      storeName,
      storeSubtitle: subtitleParts.join(" - "),
      cashierName,
    };
  }

  /** Khớp BillPreview: máy in BILL/ALL bật đầu tiên; ?paper=58|80 ép khổ. */
  function pdfExportBillPaperMm(printers, queryPaper) {
    const q = Number(queryPaper);
    if (q === 58) return 58;
    if (q === 80) return 80;
    const list = (printers || []).filter(
      (p) =>
        Number(p.is_enabled) !== 0 &&
        (String(p.type || "").toUpperCase() === "BILL" ||
          String(p.type || "").toUpperCase() === "ALL")
    );
    const ps = Number(list[0]?.paper_size);
    return ps === 58 ? 58 : 80;
  }

  // Xuất hóa đơn PDF — khổ phiếu nhiệt + cùng bill_* settings; ?format=base64 nếu proxy cắt binary; ?paper=58|80
  app.get("/bills/:id/pdf", authMiddleware, requireRole("admin"), async (req, res) => {
    const { id } = req.params;
    const billId = Number(id);
    if (!Number.isFinite(billId) || billId < 1) {
      return res.status(400).json({ error: "ID hóa đơn không hợp lệ" });
    }
    const asBase64 =
      String(req.query.format || "").toLowerCase() === "base64" || req.query.base64 === "1";

    try {
      const bill = await mongoDb.collection("bills").findOne(mongoBillBySqliteId(billId));
      if (!bill) return res.status(404).json({ error: "Not found" });
      const items = await mongoDb
        .collection("bill_items")
        .find(mongoItemsByBillId(billId))
        .sort({ sqlite_id: 1 })
        .toArray();

      const store = getStoreProfile();
      const payload = {
        storeName: store.storeName,
        billId: Number(bill.sqlite_id ?? bill.id ?? billId),
        tableNum: Number(bill.table_num || 0),
        createdAt: bill.created_at || "",
        total: Number(bill.total || 0),
        items: items.map((it) => ({
          name: it.name || "",
          price: Number(it.price || 0),
          qty: Number(it.qty || 0),
        })),
      };

      const paperMm = pdfExportBillPaperMm(printersCache, req.query.paper);

      let buf;
      try {
        buf = await buildBillPdfBuffer(
          { title: `Hóa đơn #${payload.billId}` },
          (doc) => renderBillPdf(doc, { ...payload, isReprint: false }, settingsCache, paperMm),
          buildThermalPdfDocOptions(paperMm)
        );
      } catch (pdfErr) {
        console.error("[pdf] buildBillPdfBuffer:", pdfErr && pdfErr.stack ? pdfErr.stack : pdfErr);
        return res.status(500).json({
          error: "Không tạo được PDF",
          detail: String(pdfErr && pdfErr.message ? pdfErr.message : pdfErr),
        });
      }

      if (asBase64) {
        res.setHeader("Cache-Control", "private, no-store");
        return res.json({
          filename: `hoa-don-${payload.billId}.pdf`,
          mimeType: "application/pdf",
          data: buf.toString("base64"),
        });
      }

      res.status(200);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="hoa-don-${payload.billId}.pdf"`);
      res.setHeader("Content-Length", String(buf.length));
      res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.end(buf);
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ error: e.message || String(e) });
    }
  });

  async function createPrinter(ip) {
    const printerIP = ip || getPrinterIP();
    return createSafePrinter({
      type: PrinterTypes.EPSON,
      interface: `tcp://${printerIP}`,
      characterSet: CharacterSet.TCVN_3_VIETNAMESE,
      removeSpecialCharacters: false,
      lineCharacter: "-",
      options: { timeout: 5000 },
    });
  }

  // Danh sách máy in Windows
  app.get("/printers", async (req, res) => {
    const printers = await listWindowsPrinters();
    res.json(printers);
  });

  // =============================================
  // SETTINGS APIs
  // =============================================

  // =============================================
  // WINDOWS PRINTERS APIs
  // =============================================

  app.get("/windows_printers", authMiddleware, async (req, res) => {
    try {
      const docs = await mongoDb.collection("windows_printers").find({}).sort({ sqlite_id: 1 }).toArray();
      res.json(
        docs.map((d) => ({
          id: Number(d.sqlite_id ?? d.id ?? 0),
          name: d.name,
          type: d.type || "ALL",
          paper_size: Number(d.paper_size || 80),
          is_enabled: d.is_enabled !== undefined ? Number(d.is_enabled) : 1,
        }))
      );
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/windows_printers", authMiddleware, requireRole("admin"), async (req, res) => {
    const { name, type, paper_size, is_enabled } = req.body || {};
    if (!name) return res.status(400).json({ error: "Thiếu tên máy in" });
    try {
      const nextId = await getNextMongoId("windows_printers");
      await mongoDb.collection("windows_printers").insertOne({
        sqlite_id: nextId,
        name,
        type: type || "ALL",
        paper_size: Number(paper_size) || 80,
        is_enabled: is_enabled !== undefined ? Number(is_enabled) : 1,
      });
      await refreshPrintersCache();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.put("/windows_printers/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    const { name, type, paper_size, is_enabled } = req.body || {};
    const id = Number(req.params.id);
    try {
      const result = await mongoDb.collection("windows_printers").updateOne(
        { sqlite_id: id },
        {
          $set: {
            name,
            type: type || "ALL",
            paper_size: Number(paper_size) || 80,
            is_enabled: is_enabled !== undefined ? Number(is_enabled) : 1,
          },
        }
      );
      if (result.matchedCount === 0) return res.status(404).json({ error: "Không tìm thấy máy in" });
      await refreshPrintersCache();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.delete("/windows_printers/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    try {
      const result = await mongoDb.collection("windows_printers").deleteOne({ sqlite_id: id });
      if (result.deletedCount === 0) return res.status(404).json({ error: "Không tìm thấy máy in" });
      await refreshPrintersCache();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.get("/settings", authMiddleware, (req, res) => {
    res.json(settingsCache);
  });

  app.post("/settings", authMiddleware, requireRole("admin"), async (req, res) => {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ error: "Missing key" });
    try {
      await mongoDb.collection("settings").updateOne(
        { key },
        { $set: { key, value: value } },
        { upsert: true }
      );
      // update cache ngay để in/preview không bị trễ
      settingsCache[key] = value;
      res.json({ success: true, key, value });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Test kết nối máy in (IP và USB)
  app.post("/print/test", async (req, res) => {
    const { printer_key, ip, usb_name } = req.body;
    const label = printer_key || "printer";

    // ── Thử kết nối qua IP/LAN ───────────────
    if (ip && ip.trim()) {
      const trimmedIp = ip.trim();
      try {
        console.log(`🔌 [${label}] Đang kết nối TCP → ${trimmedIp}...`);
        const printer = await createPrinter(trimmedIp);
        const connected = await printer.isPrinterConnected();
        if (connected) {
          console.log(`✅ [${label}] Kết nối TCP thành công: ${trimmedIp}`);
          return res.json({ connected: true, method: "IP", ip: trimmedIp });
        } else {
          console.error(`❌ [${label}] TCP không phản hồi tại ${trimmedIp} – máy in tắt hoặc sai IP`);
        }
      } catch (err) {
        console.error(`❌ [${label}] Lỗi TCP ${trimmedIp}: ${err.message}`);
      }
    }

    // ── Thử kiểm tra USB qua Windows printer list ─
    if (usb_name && usb_name.trim()) {
      const trimmedUsb = usb_name.trim();
      console.log(`🔌 [${label}] Đang kiểm tra USB: "${trimmedUsb}"...`);
      try {
        const { exec } = require("child_process");
        const cmd = `powershell -command "Get-Printer -Name '${trimmedUsb}' | Select-Object Name,PrinterStatus | ConvertTo-Json"`;
        await new Promise((resolve) => {
          exec(cmd, { timeout: 5000 }, (err, stdout) => {
            if (err || !stdout.trim()) {
              console.error(`❌ [${label}] USB không tìm thấy máy in: "${trimmedUsb}" – kiểm tra lại tên`);
              resolve(false);
            } else {
              try {
                const info = JSON.parse(stdout.trim());
                const online = info.PrinterStatus === 0;
                if (online) {
                  console.log(`✅ [${label}] USB OK: "${trimmedUsb}" – Status: Ready`);
                } else {
                  console.error(`⚠️  [${label}] USB tìm thấy nhưng không sẵn sàng: "${trimmedUsb}" – Status: ${info.PrinterStatus}`);
                }
                res.json({ connected: online, method: "USB", usb_name: trimmedUsb });
                resolve(true);
              } catch {
                console.error(`❌ [${label}] USB parse lỗi cho: "${trimmedUsb}"`);
                resolve(false);
              }
            }
          });
        }).then(handled => {
          if (!handled) {
            res.json({ connected: false, method: "USB", usb_name: trimmedUsb, error: "Không tìm thấy máy in" });
          }
        });
        return;
      } catch (err) {
        console.error(`❌ [${label}] Lỗi kiểm tra USB: ${err.message}`);
      }
    }

    // ── Không có thông tin nào để kết nối ────────
    if (!ip && !usb_name) {
      console.error(`❌ [${label}] Chưa nhập IP hoặc tên USB`);
    } else {
      console.error(`❌ [${label}] Không kết nối được – IP: ${ip || "–"}, USB: ${usb_name || "–"}`);
    }
    res.json({ connected: false, error: "Không kết nối được máy in" });
  });

  // =============================================
  // PRINT APIs
  // =============================================

  function getBillCssOverride() {
    const v = settingsCache.bill_css_override;
    return v && String(v).trim() ? String(v).trim() : "";
  }

  function getEnabledPrintersByType(type) {
    return printersCache.filter(
      (p) => Number(p.is_enabled) === 1 && (p.type === type || p.type === "ALL")
    );
  }

  const { buildReceiptHtml } = createBuildReceiptHtml({
    getBillCssOverride,
    getBillSettings: () => settingsCache,
  });
  const { dispatchReceiptToType } = createDispatchReceiptToType({
    getEnabledPrintersByType,
    buildReceiptHtml,
  });

  /** Dùng cho Electron + UI cloud: render HTML + máy đích, không in trên server. */
  function enqueueJobsForType(type, receiptData) {
    const printers = getEnabledPrintersByType(type);
    return printers.map((printer) => ({
      printType: type,
      printerName: printer.name,
      paperSize: printer.paper_size || 80,
      html: buildReceiptHtml(receiptData, printer.paper_size || 80),
    }));
  }

  function mapToLegacyPrinter(row) {
    return {
      id: Number(row.id || 0),
      printer_name: row.name,
      job_type: row.type || "ALL",
      paper_width: Number(row.paper_size || 80),
      is_active: Number(row.is_enabled) === 1,
      created_at: row.created_at || new Date().toISOString(),
    };
  }

  async function createPrintJob(jobType, billId, payload) {
    const nextId = await getNextMongoId("print_jobs");
    const doc = {
      sqlite_id: nextId,
      bill_id: billId || null,
      job_type: jobType,
      payload,
      status: "pending",
      error_message: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await mongoDb.collection("print_jobs").insertOne(doc);
    broadcastToBridges({
      event: "NEW_PRINT_JOB",
      job: {
        id: nextId,
        bill_id: doc.bill_id,
        job_type: doc.job_type,
        payload: doc.payload,
        status: doc.status,
        error_message: doc.error_message,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
      },
    });
    return doc;
  }

  function useBridgeQueue() {
    if (PRINT_DISPATCH_MODE === "queue") return true;
    return bridgeClients.size > 0 && typeof global.printHtmlToDevice !== "function";
  }

  // =============================================
  // LEGACY PRINT BRIDGE COMPAT (giống server cũ)
  // =============================================
  app.get("/print/printers", async (req, res) => {
    try {
      res.json(printersCache.map(mapToLegacyPrinter));
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/print/printers", authMiddleware, requireRole("admin"), async (req, res) => {
    try {
      const { printer_name, job_type, paper_width } = req.body || {};
      if (!printer_name || !job_type) {
        return res.status(400).json({ error: "Thiếu printer_name hoặc job_type" });
      }
      const nextId = await getNextMongoId("windows_printers");
      await mongoDb.collection("windows_printers").insertOne({
        sqlite_id: nextId,
        name: String(printer_name).trim(),
        type: String(job_type).trim().toUpperCase() || "ALL",
        paper_size: Number(paper_width) || 80,
        is_enabled: 1,
        created_at: new Date().toISOString(),
      });
      await refreshPrintersCache();
      const created = printersCache.find((p) => Number(p.id) === nextId);
      res.json(mapToLegacyPrinter(created || { id: nextId, name: printer_name, type: job_type, paper_size: paper_width, is_enabled: 1 }));
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.put("/print/printers/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { printer_name, job_type, paper_width, is_active } = req.body || {};
      const setData = {};
      if (printer_name !== undefined) setData.name = String(printer_name || "").trim();
      if (job_type !== undefined) setData.type = String(job_type || "ALL").trim().toUpperCase();
      if (paper_width !== undefined) setData.paper_size = Number(paper_width) || 80;
      if (is_active !== undefined) setData.is_enabled = is_active ? 1 : 0;
      const result = await mongoDb.collection("windows_printers").updateOne(
        { sqlite_id: id },
        { $set: setData }
      );
      if (!result.matchedCount) return res.status(404).json({ error: "Không tìm thấy máy in" });
      await refreshPrintersCache();
      const updated = printersCache.find((p) => Number(p.id) === id);
      res.json(mapToLegacyPrinter(updated || { id, ...setData }));
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.delete("/print/printers/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      await mongoDb.collection("windows_printers").deleteOne({ sqlite_id: id });
      await refreshPrintersCache();
      res.json({ deleted: true });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.get("/print/jobs", async (req, res) => {
    try {
      const status = String(req.query.status || "pending");
      const limit = Number(req.query.limit) || 50;
      const docs = await mongoDb
        .collection("print_jobs")
        .find({ status })
        .sort({ sqlite_id: 1 })
        .limit(limit)
        .toArray();
      res.json(
        docs.map((d) => ({
          id: Number(d.sqlite_id || 0),
          bill_id: d.bill_id ?? null,
          job_type: d.job_type,
          payload: d.payload,
          status: d.status || "pending",
          error_message: d.error_message || "",
          created_at: d.created_at,
          updated_at: d.updated_at,
        }))
      );
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/print/jobs/:id/done", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const result = await mongoDb.collection("print_jobs").updateOne(
        { sqlite_id: id, status: "pending" },
        { $set: { status: "done", updated_at: new Date().toISOString() } }
      );
      if (!result.matchedCount) return res.status(404).json({ error: "Job không tồn tại hoặc đã xử lý" });
      const job = await mongoDb.collection("print_jobs").findOne({ sqlite_id: id });
      res.json({ success: true, job });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/print/jobs/:id/fail", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { error_message } = req.body || {};
      const result = await mongoDb.collection("print_jobs").updateOne(
        { sqlite_id: id },
        {
          $set: {
            status: "failed",
            error_message: String(error_message || "Unknown error"),
            updated_at: new Date().toISOString(),
          },
        }
      );
      if (!result.matchedCount) return res.status(404).json({ error: "Job không tồn tại" });
      const job = await mongoDb.collection("print_jobs").findOne({ sqlite_id: id });
      res.json({ success: true, job });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/print/jobs/:id/retry", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const result = await mongoDb.collection("print_jobs").updateOne(
        { sqlite_id: id },
        {
          $set: {
            status: "pending",
            error_message: "",
            updated_at: new Date().toISOString(),
          },
        }
      );
      if (!result.matchedCount) return res.status(404).json({ error: "Job không tồn tại" });
      const job = await mongoDb.collection("print_jobs").findOne({ sqlite_id: id });
      broadcastToBridges({ event: "NEW_PRINT_JOB", job });
      res.json({ success: true, job });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Hàng đợi in phía client (Electron / máy quầy)
  app.post("/print/render-queue", authMiddleware, requireRole("admin", "staff"), async (req, res) => {
    const { action } = req.body || {};
    try {
      if (action === "kitchen") {
        const { table_num, items = [] } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: "Danh sách món không hợp lệ" });
        }
        const nowText = new Date().toLocaleString("vi-VN");
        const foodItems = items.filter((i) => i.type !== "DRINK");
        const drinkItems = items.filter((i) => i.type === "DRINK");
        const prints = [];
        if (foodItems.length > 0) {
          prints.push(
            ...enqueueJobsForType("KITCHEN", {
              title: "PHIẾU BẾP",
              subtitle: "ĐỒ ĂN",
              tableNum: table_num,
              timeLabel: "Giờ",
              timeValue: nowText,
              items: foodItems,
              footer: "Giao bếp",
              hidePrices: true,
            })
          );
        }
        if (drinkItems.length > 0) {
          prints.push(
            ...enqueueJobsForType("BILL", {
              title: "PHIẾU PHA CHẾ",
              subtitle: "NƯỚC",
              tableNum: table_num,
              timeLabel: "Giờ",
              timeValue: nowText,
              items: drinkItems,
              footer: "Pha chế",
              hidePrices: true,
            })
          );
        }
        return res.json({ success: true, prints, queued: prints.length });
      }

      if (action === "tamtinh") {
        const { table_num, items = [], total } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: "Danh sách món không hợp lệ" });
        }
        const store = getStoreProfile();
        const prints = enqueueJobsForType("TAMTINH", {
          title: store.storeName || "TẠM TÍNH",
          tableNum: table_num,
          timeLabel: "Giờ",
          timeValue: new Date().toLocaleString("vi-VN"),
          items,
          totalLabel: "TẠM TÍNH",
          totalValue: total,
          billNo: "--",
          cashier: store.cashierName,
          footer: "",
          groupItemsByType: true,
        });
        return res.json({ success: true, prints, queued: prints.length });
      }

      if (action === "bill") {
        const { table_num, items = [], total } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: "Danh sách món không hợp lệ" });
        }
        const store = getStoreProfile();
        const prints = enqueueJobsForType("BILL", {
          title: store.storeName,
          subtitle: store.storeSubtitle,
          tableNum: table_num,
          timeLabel: "Ngày",
          timeValue: new Date().toLocaleString("vi-VN"),
          items,
          totalLabel: "THÀNH TIỀN",
          totalValue: total,
          billNo: "--",
          cashier: store.cashierName,
          footer: "",
          groupItemsByType: true,
        });
        return res.json({ success: true, prints, queued: prints.length });
      }

      if (action === "bill_reprint") {
        const billId = Number(req.body.billId);
        if (!billId) return res.status(400).json({ error: "Thiếu billId" });
        const bill = await mongoDb.collection("bills").findOne(mongoBillBySqliteId(billId));
        if (!bill) return res.status(404).json({ error: "Không tìm thấy hóa đơn" });
        const items = await mongoDb
          .collection("bill_items")
          .find(mongoItemsByBillId(billId))
          .sort({ sqlite_id: 1 })
          .toArray();
        const store = getStoreProfile();
        const prints = enqueueJobsForType("BILL", {
          title: store.storeName,
          subtitle: store.storeSubtitle,
          tableNum: Number(bill.table_num || 0),
          timeLabel: "Ngày",
          timeValue: new Date(bill.created_at).toLocaleString("vi-VN"),
          items,
          totalLabel: "THÀNH TIỀN",
          totalValue: Number(bill.total || 0),
          billNo: Number(bill.sqlite_id ?? bill.id ?? billId),
          cashier: store.cashierName,
          reprint: true,
          footer: "",
          groupItemsByType: true,
        });
        return res.json({ success: true, prints, queued: prints.length });
      }

      return res.status(400).json({ error: "action không hợp lệ" });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  });

  // In phiếu bếp (Tách Đồ ăn -> Bếp, Nước uống -> Bill/Pha chế)
  app.post("/print/kitchen", authMiddleware, requireRole("admin", "staff"), async (req, res) => {
    const { table_num, items = [] } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Danh sách món không hợp lệ" });
    }
    if (useBridgeQueue()) {
      try {
        const job = await createPrintJob("KITCHEN", null, {
          table_num,
          items,
          note: "",
        });
        return res.json({ success: true, job_id: Number(job.sqlite_id || 0) });
      } catch (e) {
        return res.status(500).json({ error: e.message || String(e) });
      }
    }

    const nowText = new Date().toLocaleString("vi-VN");
    const foodItems = items.filter((i) => i.type !== "DRINK");
    const drinkItems = items.filter((i) => i.type === "DRINK");
    const errors = [];

    try {
      if (foodItems.length > 0) {
        dispatchReceiptToType("KITCHEN", {
          title: "PHIẾU BẾP",
          subtitle: "ĐỒ ĂN",
          tableNum: table_num,
          timeLabel: "Giờ",
          timeValue: nowText,
          items: foodItems,
          footer: "Giao bếp",
          hidePrices: true,
        });
      }
    } catch (err) {
      errors.push(err.message);
    }

    try {
      if (drinkItems.length > 0) {
        dispatchReceiptToType("BILL", {
          title: "PHIẾU PHA CHẾ",
          subtitle: "NƯỚC",
          tableNum: table_num,
          timeLabel: "Giờ",
          timeValue: nowText,
          items: drinkItems,
          footer: "Pha chế",
          hidePrices: true,
        });
      }
    } catch (err) {
      errors.push(err.message);
    }

    if (errors.length && foodItems.length + drinkItems.length > 0) {
      return res.status(503).json({ error: errors.join(", ") });
    }

    res.json({ success: true });
  });

  // Tạm tính
  app.post("/print/tamtinh", authMiddleware, requireRole("admin", "staff"), async (req, res) => {
    const { table_num, items = [], total } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Danh sách món không hợp lệ" });
    }
    if (useBridgeQueue()) {
      try {
        const job = await createPrintJob("TAMTINH", null, {
          table_num,
          items,
          total,
        });
        return res.json({ success: true, job_id: Number(job.sqlite_id || 0) });
      } catch (e) {
        return res.status(500).json({ error: e.message || String(e) });
      }
    }

    try {
      const store = getStoreProfile();
      const sent = dispatchReceiptToType("TAMTINH", {
        title: store.storeName || "TẠM TÍNH",
        tableNum: table_num,
        timeLabel: "Giờ",
        timeValue: new Date().toLocaleString("vi-VN"),
        items,
        totalLabel: "TẠM TÍNH",
        totalValue: total,
        billNo: "--",
        cashier: store.cashierName,
        footer: "",
        groupItemsByType: true,
      });
      res.json({ success: true, queued: sent });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // In hóa đơn tài chính
  app.post("/print/bill", authMiddleware, requireRole("admin"), async (req, res) => {
    const { table_num, items = [], total } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Danh sách món không hợp lệ" });
    }
    if (useBridgeQueue()) {
      try {
        const job = await createPrintJob("BILL", null, {
          table_num,
          items,
          total,
        });
        return res.json({ success: true, job_id: Number(job.sqlite_id || 0) });
      } catch (e) {
        return res.status(500).json({ error: e.message || String(e) });
      }
    }

    try {
      const store = getStoreProfile();
      const sent = dispatchReceiptToType("BILL", {
        title: store.storeName,
        subtitle: store.storeSubtitle,
        tableNum: table_num,
        timeLabel: "Ngày",
        timeValue: new Date().toLocaleString("vi-VN"),
        items,
        totalLabel: "THÀNH TIỀN",
        totalValue: total,
        billNo: "--",
        cashier: store.cashierName,
        footer: "",
        groupItemsByType: true,
      });
      res.json({ success: true, queued: sent });
    } catch (err) {
      console.error("Lỗi in hóa đơn:", err);
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // In lại hóa đơn từ lịch sử
  app.post("/print/bill/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    const { id } = req.params;
    const billId = Number(id);
    try {
      const bill = await mongoDb.collection("bills").findOne(mongoBillBySqliteId(billId));
      if (!bill) return res.status(404).json({ error: "Không tìm thấy hóa đơn" });

      const items = await mongoDb.collection("bill_items")
        .find(mongoItemsByBillId(billId))
        .sort({ sqlite_id: 1 })
        .toArray();
      if (useBridgeQueue()) {
        try {
          const job = await createPrintJob("BILL", billId, {
            bill_id: billId,
            table_num: Number(bill.table_num || 0),
            items,
            total: Number(bill.total || 0),
            reprint: true,
          });
          return res.json({ success: true, job_id: Number(job.sqlite_id || 0) });
        } catch (err) {
          return res.status(500).json({ error: err.message || String(err) });
        }
      }
      try {
        const store = getStoreProfile();
        const sent = dispatchReceiptToType("BILL", {
          title: store.storeName,
          subtitle: store.storeSubtitle,
          tableNum: Number(bill.table_num || 0),
          timeLabel: "Ngày",
          timeValue: new Date(bill.created_at).toLocaleString("vi-VN"),
          items,
          totalLabel: "THÀNH TIỀN",
          totalValue: Number(bill.total || 0),
          billNo: Number(bill.sqlite_id ?? bill.id ?? billId),
          cashier: store.cashierName,
          reprint: true,
          footer: "",
          groupItemsByType: true,
        });
        res.json({ success: true, queued: sent });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Kiểm tra kết nối máy in
  app.get("/print/status", async (req, res) => {
    if (bridgeClients.size > 0) {
      return res.json({
        connected: true,
        bridge_count: bridgeClients.size,
        mode: "bridge",
      });
    }
    const printers = printersCache.filter((p) => Number(p.is_enabled) === 1);
    if (printers.length === 0) return res.json({ connected: false });

    let allConnected = false;
    for (const p of printers) {
      try {
        const pt = createSafePrinter({
          type: PrinterTypes.EPSON,
          interface: `printer:${p.name}`,
          driver: customDriver
        });
        if (await pt.isPrinterConnected()) {
          allConnected = true; break;
        }
      } catch (e) {
        // skip
      }
    }
    res.json({ connected: allConnected, count: printers.length, bridge_count: bridgeClients.size, mode: "local" });
  });

  // Mở cửa sổ Log Electron từ React UI
  app.post("/open-log", authMiddleware, requireRole("admin"), (req, res) => {
    if (typeof global.openLogWindow === "function") {
      global.openLogWindow();
      res.json({ ok: true });
    } else {
      res.json({ ok: false, error: "Chỉ hoạt động trong Electron" });
    }
  });

  // Trả HTML preview để frontend live-preview đúng template in thực tế
  app.post("/print/preview", (req, res) => {
    try {
      const { receipt, paper_size, css_override } = req.body || {};
      if (!receipt || !Array.isArray(receipt.items)) {
        return res.status(400).json({ error: "Thiếu dữ liệu receipt hợp lệ" });
      }
      const html = buildReceiptHtml(receipt, Number(paper_size) || 80, css_override);
      res.json({ html });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Tự động phân luồng in HTML ngầm qua Electron
  app.post("/print-html", (req, res) => {
    const { type, html } = req.body;
    if (typeof global.printHtmlToDevice !== "function") {
      return res.status(503).json({ error: "Không hỗ trợ in ngầm ngoài môi trường Electron" });
    }

    const printers = printersCache.filter(
      (p) => Number(p.is_enabled) === 1 && (p.type === type || p.type === "ALL")
    );
    if (printers.length === 0) return res.status(404).json({ error: `Chưa có cấu hình máy in cho ${type}` });

    for (const p of printers) {
      console.log(`🖨️  Gửi bản in HTML ngầm tới máy in: ${p.name}`);
      global.printHtmlToDevice(html, p.name, { paperSize: p.paper_size || 80 });
    }
    res.json({ success: true });
  });

  // Catch-all: serve React index.html
  if (fs.existsSync(UI_BUILD)) {
    app.get("*", (req, res) => {
      res.sendFile(path.join(UI_BUILD, "index.html"));
    });
  }

  // =============================================
  // START SERVER
  // =============================================
  server.listen(3000, () => {
    console.log("✅ Server đang chạy tại http://localhost:3000");
    const printerIp = getPrinterIP();
    console.log(`🖨️  Máy in POS: ${printerIp ? `tcp://${printerIp}` : "chưa cấu hình"}`);
    console.log("   → Cấu hình IP máy in qua giao diện Settings");
    console.log(`🔌 Print Bridge WS: ws://localhost:3000/bridge?secret=${PRINT_BRIDGE_SECRET}`);
    if (typeof global.printHtmlToDevice !== "function") {
      console.log("ℹ️  In HTML ngầm tới máy Windows: chạy `npm run electron` (cùng thư mục, đã build UI nếu cần).");
    }
  });
}

// Khởi động
initMongoOnly().catch(err => {
  console.error("❌ Không thể khởi tạo DB:", err);
  process.exit(1);
});