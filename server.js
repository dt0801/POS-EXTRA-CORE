const express = require("express");
const cors = require("cors");
const multer = require("multer");
const http = require("http");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  WindowsRawDriver,
  createSafePrinter,
  listWindowsPrinters,
} = require("./server/printing/windowsPrinter");
const { createBuildReceiptHtml } = require("./server/print-templates/receiptHtml");
const { createDispatchReceiptToType } = require("./server/printing/receiptDispatch");
const { buildBillPdfBuffer } = require("./server/pdf/buildBillPdfBuffer");
const { renderBillPdf, buildThermalPdfDocOptions } = require("./server/pdf/renderBillPdf");
const { menuSeedItems } = require("./server/seed/menuSeed");
const cloudinary = require("cloudinary").v2;
const {
  isCloudinaryConfigured,
  persistMenuImage: persistMenuImageCore,
} = require("./core/menu/menuImage");
const { createBill } = require("./core/bill/createBill");
const { listBillsByDate } = require("./core/bill/listBillsByDate");
const { getBillById } = require("./core/bill/getBillById");
const { getBillPdf } = require("./core/bill/getBillPdf");
const { listUsers } = require("./core/users/listUsers");
const { createUser } = require("./core/users/createUser");
const { updateUser } = require("./core/users/updateUser");
const { deleteUser } = require("./core/users/deleteUser");
const { getOrderSession } = require("./core/orderSession/getOrderSession");
const { putOrderSession } = require("./core/orderSession/putOrderSession");
const { getMenuList } = require("./core/menu/getMenuList");
const { createMenuItem } = require("./core/menu/createMenuItem");
const { updateMenuItem } = require("./core/menu/updateMenuItem");
const { deleteMenuItem } = require("./core/menu/deleteMenuItem");
const { authLogin } = require("./core/auth/login");
const { getAuthMe } = require("./core/auth/getAuthMe");
const { authLogout } = require("./core/auth/logout");
const { getTablesList } = require("./core/tables/getTablesList");
const { updateTableStatus } = require("./core/tables/updateTableStatus");
const { createTable } = require("./core/tables/createTable");
const { renameTable } = require("./core/tables/renameTable");
const { deleteTable } = require("./core/tables/deleteTable");
const { getStatsDaily } = require("./core/stats/getStatsDaily");
const { getStatsMonthly } = require("./core/stats/getStatsMonthly");
const { getStatsYearly } = require("./core/stats/getStatsYearly");
const { getStatsToday } = require("./core/stats/getStatsToday");
const {
  getStoreProfile: getStoreProfileFromCache,
  getBillCssOverride: getBillCssOverrideFromCache,
} = require("./core/settings/getStoreProfile");
const { getPrinterIP: getPrinterIPFromSettings } = require("./core/settings/getPrinterIP");
const { getSettings } = require("./core/settings/getSettings");
const { upsertSetting } = require("./core/settings/upsertSetting");
const { uploadStoreLogo } = require("./core/settings/uploadStoreLogo");
const { listWindowsPrintersApi } = require("./core/windowsPrinters/listWindowsPrintersApi");
const { createWindowsPrinter } = require("./core/windowsPrinters/createWindowsPrinter");
const { updateWindowsPrinter } = require("./core/windowsPrinters/updateWindowsPrinter");
const { deleteWindowsPrinter } = require("./core/windowsPrinters/deleteWindowsPrinter");
const { listLegacyPrinters } = require("./core/print/listLegacyPrinters");
const { legacyCreatePrinter } = require("./core/print/legacyCreatePrinter");
const { legacyUpdatePrinter } = require("./core/print/legacyUpdatePrinter");
const { legacyDeletePrinter } = require("./core/print/legacyDeletePrinter");
const {
  listPrintJobs,
  markPrintJobDone,
  markPrintJobFail,
  retryPrintJob,
} = require("./core/print/printJobs");
const { printTestConnection } = require("./core/print/printTestConnection");
const { handleRenderQueue } = require("./core/print/handleRenderQueue");
const { postKitchenPrint } = require("./core/print/postKitchenPrint");
const { postTamtinhPrint } = require("./core/print/postTamtinhPrint");
const { postBillPrint } = require("./core/print/postBillPrint");
const { postBillReprintPrint } = require("./core/print/postBillReprintPrint");
const { getPrintStatus } = require("./core/print/getPrintStatus");
const { postPrintPreview } = require("./core/print/postPrintPreview");
const { postPrintHtml } = require("./core/print/postPrintHtml");
const { getEnabledPrintersByType: gepByType, enqueueJobsForType: ejft } = require("./core/print/printingQueue");
const { createPrintJob: createPrintJobCore } = require("./core/print/createPrintJob");
const { useBridgeQueue: useBridgeQueueCore } = require("./core/print/useBridgeQueue");
const { createTcpPrinterFactory } = require("./core/print/createTcpPrinter");
const { postOpenLog } = require("./core/print/openLog");
const { listSystemPrinters } = require("./core/print/listSystemPrinters");
const { connectMongoFromEnv } = require("./core/mongo/connectMongo");
const { getNextMongoId: getNextMongoIdCore } = require("./core/mongo/getNextMongoId");
const { loadSettingsCache: loadSettingsCacheCore } = require("./core/mongo/loadSettingsCache");
const { loadPrintersCache: loadPrintersCacheCore } = require("./core/mongo/loadPrintersCache");
const { seedMongoMenuIfEmpty } = require("./core/mongo/seedMongoMenuIfEmpty");
const { ensureAuthBootstrap } = require("./core/mongo/ensureAuthBootstrap");
const { ensureMongoIndexes } = require("./core/mongo/ensureMongoIndexes");
const {
  ensureDefaultSettings,
  ensureDefaultOrderSession,
} = require("./core/mongo/ensureDefaultSettingsAndOrderSession");
const { getDebugUploads } = require("./core/debug/getDebugUploads");
const { createAuthMiddleware } = require("./core/auth/createAuthMiddleware");
const { requireRole } = require("./core/auth/requireRole");
const { createPosClientRegistry } = require("./core/ws/posClientRegistry");
const { broadcastToBridges: broadcastToBridgesCore } = require("./core/ws/broadcastToBridges");
const { setupWebSocketServer } = require("./core/ws/setupWebSocketServer");

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
  const result = getDebugUploads({ uploadsDir: UPLOADS_DIR, baseDir: BASE_DIR }, req.query);
  res.status(result.status).json(result.body);
});

// Serve React build nếu tồn tại (production)
if (fs.existsSync(UI_BUILD)) {
  app.use(express.static(UI_BUILD));
  console.log("✅ Serving UI từ:", UI_BUILD);
}

// =============================================
// MULTER – ảnh menu (memory → Cloudinary hoặc ghi disk)
// =============================================
if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
    api_key: (process.env.CLOUDINARY_API_KEY || "").trim(),
    api_secret: (process.env.CLOUDINARY_API_SECRET || "").trim(),
  });
}

async function persistMenuImage(file) {
  return persistMenuImageCore(UPLOADS_DIR, file);
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
const MENU_LIST_CACHE_TTL_MS = Math.max(5000, Number(process.env.MENU_LIST_CACHE_TTL_MS || 60000));
const PRINT_BRIDGE_SECRET = (process.env.PRINT_BRIDGE_SECRET || "bbq-pos-bridge-secret-2024").trim();
const PRINT_DISPATCH_MODE = (process.env.PRINT_DISPATCH_MODE || "queue").trim().toLowerCase();
const bridgeClients = new Set();
const { addPosClient, removePosClient, notifyForceLogout } = createPosClientRegistry();

function makeSessionId() {
  return Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

const authMiddleware = createAuthMiddleware({
  mongoDbGetter: () => mongoDb,
  jwt,
  jwtSecret: JWT_SECRET,
});

// =============================================
// WEBSOCKET – POS / Print Bridge
// =============================================
setupWebSocketServer({
  server,
  jwt,
  jwtSecret: JWT_SECRET,
  printBridgeSecret: PRINT_BRIDGE_SECRET,
  bridgeClients,
  addPosClient,
  removePosClient,
});

function broadcastToBridges(payload) {
  broadcastToBridgesCore(bridgeClients, payload);
}

async function connectMongoIfConfigured() {
  const r = await connectMongoFromEnv();
  if (!r.ok) return;
  mongoClient = r.client;
  mongoDb = r.db;
  mongoReady = true;
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
  settingsCache = await loadSettingsCacheCore(mongoDb);
}

async function refreshPrintersCache() {
  printersCache = await loadPrintersCacheCore(mongoDb);
}

async function getNextMongoId(collectionName) {
  return getNextMongoIdCore(mongoDb, collectionName);
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

  await seedMongoMenuIfEmpty({ mongoDb, mongoReady, menuSeedItems });
  await ensureAuthBootstrap({
    mongoDb,
    bcrypt,
    getNextMongoId,
  });
  await ensureMongoIndexes({ mongoDb, mongoReady });

  await ensureDefaultSettings(mongoDb);
  await ensureDefaultOrderSession(mongoDb);

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

function startServer() {
  // =============================================
  // AUTH APIs
  // =============================================
  app.post("/auth/login", async (req, res) => {
    const result = await authLogin(
      {
        mongoDb,
        bcrypt,
        jwt,
        jwtSecret: JWT_SECRET,
        makeSessionId,
        notifyForceLogout,
      },
      req.body || {}
    );
    res.status(result.status).json(result.body);
  });

  app.get("/auth/me", authMiddleware, (req, res) => {
    res.json(getAuthMe(req.user));
  });

  app.post("/auth/logout", authMiddleware, async (req, res) => {
    const result = await authLogout({ mongoDb, notifyForceLogout }, req.user);
    res.status(result.status).json(result.body);
  });

  // =============================================
  // USER MANAGEMENT APIs (admin)
  // =============================================
  app.get("/users", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await listUsers({ mongoDb });
    res.status(result.status).json(result.body);
  });

  app.post("/users", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await createUser({ mongoDb, getNextMongoId, bcrypt }, req.body || {});
    res.status(result.status).json(result.body);
  });

  app.put("/users/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await updateUser(
      { mongoDb, bcrypt, notifyForceLogout },
      { id: Number(req.params.id), body: req.body || {} }
    );
    res.status(result.status).json(result.body);
  });

  app.delete("/users/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await deleteUser(
      { mongoDb, notifyForceLogout },
      {
        id: Number(req.params.id),
        actorUserId: req.user.id,
        actorUsername: req.user.username,
      }
    );
    res.status(result.status).json(result.body);
  });

  // Lấy toàn bộ menu
  app.get("/menu", authMiddleware, async (req, res) => {
    const result = await getMenuList({ mongoDb, ttlMs: MENU_LIST_CACHE_TTL_MS });
    if (result.headers) {
      Object.entries(result.headers).forEach(([k, v]) => res.set(k, v));
    }
    res.status(result.status).json(result.body);
  });

  // Thêm món mới
  app.post("/menu", authMiddleware, requireRole("admin"), menuUpload.single("image"), async (req, res) => {
    const result = await createMenuItem(
      { mongoDb, getNextMongoId, persistMenuImage },
      { body: req.body, file: req.file }
    );
    res.status(result.status).json(result.body);
  });

  // Cập nhật món
  app.put("/menu/:id", authMiddleware, requireRole("admin"), menuUpload.single("image"), async (req, res) => {
    const result = await updateMenuItem(
      { mongoDb, persistMenuImage },
      { body: req.body, file: req.file, id: req.params.id }
    );
    res.status(result.status).json(result.body);
  });

  // Xóa món
  app.delete("/menu/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await deleteMenuItem({ mongoDb }, { id: req.params.id });
    res.status(result.status).json(result.body);
  });

  // =============================================
  // ORDER SESSION (đơn đang order — lưu DB)
  // =============================================

  app.get("/order-session", authMiddleware, async (req, res) => {
    const result = await getOrderSession({ mongoDb });
    res.status(result.status).json(result.body);
  });

  app.put("/order-session", authMiddleware, async (req, res) => {
    const result = await putOrderSession({ mongoDb }, { body: req.body || {} });
    res.status(result.status).json(result.body);
  });

  // =============================================
  // TABLE STATUS APIs
  // =============================================

  // Lấy trạng thái tất cả bàn
  app.get("/tables", authMiddleware, async (req, res) => {
    const result = await getTablesList({ mongoDb });
    res.status(result.status).json(result.body);
  });

  // Cập nhật trạng thái bàn
  app.post("/tables/:num/status", authMiddleware, requireRole("admin", "staff"), async (req, res) => {
    const result = await updateTableStatus({ mongoDb }, { num: req.params.num, body: req.body });
    res.status(result.status).json(result.body);
  });

  // Thêm bàn mới
  app.post("/tables", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await createTable({ mongoDb }, { body: req.body });
    res.status(result.status).json(result.body);
  });

  // Đổi số bàn
  app.put("/tables/:num", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await renameTable(
      { mongoDb },
      { oldNum: Number(req.params.num), body: req.body }
    );
    res.status(result.status).json(result.body);
  });

  // Xóa bàn
  app.delete("/tables/:num", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await deleteTable({ mongoDb }, { num: Number(req.params.num) });
    res.status(result.status).json(result.body);
  });

  // =============================================
  // BILLS APIs
  // =============================================

  // Tạo hóa đơn mới
  app.post("/bills", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await createBill({ mongoDb, getNextMongoId }, req.body || {});
    res.status(result.status).json(result.body);
  });

  // Lịch sử hóa đơn theo ngày
  app.get("/bills", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await listBillsByDate(
      { mongoDb },
      { date: req.query.date || new Date().toISOString().split("T")[0] }
    );
    res.status(result.status).json(result.body);
  });

  // Chi tiết 1 hóa đơn
  app.get("/bills/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await getBillById({ mongoDb }, { id: req.params.id });
    res.status(result.status).json(result.body);
  });

  // =============================================
  // THỐNG KÊ DOANH THU
  // =============================================

  // Doanh thu theo ngày trong tháng
  app.get("/stats/daily", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await getStatsDaily({ mongoDb }, { month: req.query.month });
    res.status(result.status).json(result.body);
  });

  // Stats theo tháng (gộp theo ngày trong tháng đó)
  app.get("/stats/monthly", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await getStatsMonthly({ mongoDb }, { month: req.query.month });
    res.status(result.status).json(result.body);
  });

  // Stats theo năm (gộp theo tháng)
  app.get("/stats/yearly", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await getStatsYearly({ mongoDb }, { year: req.query.year });
    res.status(result.status).json(result.body);
  });

  // Tổng quan hôm nay
  app.get("/stats/today", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await getStatsToday({ mongoDb });
    res.status(result.status).json(result.body);
  });

  // =============================================
  // PRINTER CONFIG
  // =============================================

  function getPrinterIP() {
    return getPrinterIPFromSettings(settingsCache);
  }

  function getStoreProfile() {
    return getStoreProfileFromCache(settingsCache);
  }

  const createPrinter = createTcpPrinterFactory({ createSafePrinter, getPrinterIP });

  // Xuất hóa đơn PDF — khổ phiếu nhiệt + cùng bill_* settings; ?format=base64 nếu proxy cắt binary; ?paper=58|80
  app.get("/bills/:id/pdf", authMiddleware, requireRole("admin"), async (req, res) => {
    try {
      const result = await getBillPdf(
        {
          mongoDb,
          settingsCache,
          printersCache,
          buildBillPdfBuffer,
          renderBillPdf,
          buildThermalPdfDocOptions,
          getStoreProfile,
        },
        { id: req.params.id, query: req.query || {} }
      );
      if (result.kind === "error") {
        return res.status(result.status).json(result.body);
      }
      if (result.kind === "json") {
        if (result.headers) {
          Object.entries(result.headers).forEach(([k, v]) => res.setHeader(k, v));
        }
        return res.status(result.status).json(result.body);
      }
      if (result.kind === "pdf") {
        res.status(200);
        Object.entries(result.headers).forEach(([k, v]) => res.setHeader(k, v));
        return res.end(result.buffer);
      }
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Danh sách máy in Windows
  app.get("/printers", async (req, res) => {
    const result = await listSystemPrinters({ listWindowsPrinters });
    res.status(result.status).json(result.body);
  });

  // =============================================
  // SETTINGS APIs
  // =============================================

  // =============================================
  // WINDOWS PRINTERS APIs
  // =============================================

  app.get("/windows_printers", authMiddleware, async (req, res) => {
    const result = await listWindowsPrintersApi({ mongoDb });
    res.status(result.status).json(result.body);
  });

  app.post("/windows_printers", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await createWindowsPrinter(
      { mongoDb, getNextMongoId, refreshPrintersCache },
      req.body || {}
    );
    res.status(result.status).json(result.body);
  });

  app.put("/windows_printers/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await updateWindowsPrinter(
      { mongoDb, refreshPrintersCache },
      { id: Number(req.params.id), body: req.body || {} }
    );
    res.status(result.status).json(result.body);
  });

  app.delete("/windows_printers/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await deleteWindowsPrinter({ mongoDb, refreshPrintersCache }, Number(req.params.id));
    res.status(result.status).json(result.body);
  });

  app.get("/settings", authMiddleware, (req, res) => {
    const result = getSettings(settingsCache);
    res.status(result.status).json(result.body);
  });

  app.post("/settings", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await upsertSetting({ mongoDb, settingsCache }, req.body || {});
    res.status(result.status).json(result.body);
  });

  app.post("/settings/logo", authMiddleware, requireRole("admin"), menuUpload.single("logo"), async (req, res) => {
    const result = await uploadStoreLogo(
      { mongoDb, settingsCache, persistMenuImage },
      {
        file: req.file,
        publicBaseUrl: `${req.protocol}://${req.get("host")}`,
      }
    );
    res.status(result.status).json(result.body);
  });

  // Test kết nối máy in (IP và USB)
  app.post("/print/test", async (req, res) => {
    const result = await printTestConnection({ createPrinter }, req.body || {});
    res.status(result.status).json(result.body);
  });

  // =============================================
  // PRINT APIs
  // =============================================

  function getBillCssOverride() {
    return getBillCssOverrideFromCache(settingsCache);
  }

  function getEnabledPrintersByType(type) {
    return gepByType(printersCache, type);
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
    return ejft(printersCache, buildReceiptHtml, type, receiptData);
  }

  async function createPrintJob(jobType, billId, payload) {
    return createPrintJobCore({ mongoDb, getNextMongoId, broadcastToBridges }, jobType, billId, payload);
  }

  function useBridgeQueue() {
    return useBridgeQueueCore({ PRINT_DISPATCH_MODE, bridgeClients });
  }

  // =============================================
  // LEGACY PRINT BRIDGE COMPAT (giống server cũ)
  // =============================================
  app.get("/print/printers", async (req, res) => {
    const result = listLegacyPrinters({ printersCache });
    res.status(result.status).json(result.body);
  });

  app.post("/print/printers", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await legacyCreatePrinter(
      { mongoDb, getNextMongoId, refreshPrintersCache, printersCache },
      req.body || {}
    );
    res.status(result.status).json(result.body);
  });

  app.put("/print/printers/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await legacyUpdatePrinter(
      { mongoDb, refreshPrintersCache, printersCache },
      { id: Number(req.params.id), body: req.body || {} }
    );
    res.status(result.status).json(result.body);
  });

  app.delete("/print/printers/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await legacyDeletePrinter({ mongoDb, refreshPrintersCache }, Number(req.params.id));
    res.status(result.status).json(result.body);
  });

  app.get("/print/jobs", async (req, res) => {
    const result = await listPrintJobs(
      { mongoDb },
      { status: req.query.status, limit: req.query.limit }
    );
    res.status(result.status).json(result.body);
  });

  app.post("/print/jobs/:id/done", async (req, res) => {
    const result = await markPrintJobDone({ mongoDb }, Number(req.params.id));
    res.status(result.status).json(result.body);
  });

  app.post("/print/jobs/:id/fail", async (req, res) => {
    const result = await markPrintJobFail(
      { mongoDb },
      { id: Number(req.params.id), error_message: (req.body || {}).error_message }
    );
    res.status(result.status).json(result.body);
  });

  app.post("/print/jobs/:id/retry", async (req, res) => {
    const result = await retryPrintJob(
      { mongoDb, broadcastToBridges },
      Number(req.params.id)
    );
    res.status(result.status).json(result.body);
  });

  // Hàng đợi in phía client (Electron / máy quầy)
  app.post("/print/render-queue", authMiddleware, requireRole("admin", "staff"), async (req, res) => {
    const result = await handleRenderQueue(
      { mongoDb, enqueueJobsForType, getStoreProfile },
      req.body || {}
    );
    res.status(result.status).json(result.body);
  });

  // In phiếu bếp (Tách Đồ ăn -> Bếp, Nước uống -> Bill/Pha chế)
  app.post("/print/kitchen", authMiddleware, requireRole("admin", "staff"), async (req, res) => {
    const result = await postKitchenPrint(
      { useBridgeQueue, createPrintJob, dispatchReceiptToType, enqueueJobsForType },
      req.body || {}
    );
    res.status(result.status).json(result.body);
  });

  // Tạm tính
  app.post("/print/tamtinh", authMiddleware, requireRole("admin", "staff"), async (req, res) => {
    const result = await postTamtinhPrint(
      { useBridgeQueue, createPrintJob, dispatchReceiptToType, getStoreProfile, enqueueJobsForType },
      req.body || {}
    );
    res.status(result.status).json(result.body);
  });

  // In hóa đơn tài chính
  app.post("/print/bill", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await postBillPrint(
      { useBridgeQueue, createPrintJob, dispatchReceiptToType, getStoreProfile, enqueueJobsForType },
      req.body || {}
    );
    res.status(result.status).json(result.body);
  });

  // In lại hóa đơn từ lịch sử
  app.post("/print/bill/:id", authMiddleware, requireRole("admin"), async (req, res) => {
    const result = await postBillReprintPrint(
      { mongoDb, useBridgeQueue, createPrintJob, dispatchReceiptToType, getStoreProfile, enqueueJobsForType },
      Number(req.params.id)
    );
    res.status(result.status).json(result.body);
  });

  // Kiểm tra kết nối máy in
  app.get("/print/status", async (req, res) => {
    const result = await getPrintStatus({
      bridgeClients,
      printersCache,
      createSafePrinter,
      customDriver,
    });
    res.status(result.status).json(result.body);
  });

  // Mở cửa sổ Log Electron từ React UI
  app.post("/open-log", authMiddleware, requireRole("admin"), (req, res) => {
    const result = postOpenLog();
    res.status(result.status).json(result.body);
  });

  // Trả HTML preview để frontend live-preview đúng template in thực tế
  app.post("/print/preview", (req, res) => {
    const result = postPrintPreview({ buildReceiptHtml }, req.body || {});
    res.status(result.status).json(result.body);
  });

  // Tự động phân luồng in HTML ngầm qua Electron
  app.post("/print-html", (req, res) => {
    const { type, html } = req.body || {};
    const result = postPrintHtml({ printersCache, type, html });
    res.status(result.status).json(result.body);
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