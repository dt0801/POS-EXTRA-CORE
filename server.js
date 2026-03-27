const express = require("express");
const cors    = require("cors");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const { exec } = require("child_process");
const { PrinterTypes, CharacterSet } = require("node-thermal-printer");
const { MongoClient, ServerApiVersion } = require("mongodb");
const {
  WindowsRawDriver,
  createSafePrinter,
  listWindowsPrinters,
} = require("./server/printing/windowsPrinter");
const { menuSeedItems } = require("./server/seed/menuSeed");

const customDriver = new WindowsRawDriver();


// ── sql.js (pure JavaScript SQLite – không cần compile native) ────
const initSqlJs = require("sql.js");

// ── Đường dẫn lưu dữ liệu cho web runtime ──
const BASE_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

const DB_PATH = path.join(BASE_DIR, "pos.db");
const LEGACY_DB_PATH = path.join(__dirname, "pos.db");
if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
  try {
    fs.copyFileSync(LEGACY_DB_PATH, DB_PATH);
    console.log("✅ Đã migrate pos.db sang userData:", DB_PATH);
  } catch (e) {
    console.error("⚠️  Không thể migrate pos.db:", e.message);
  }
}

const UPLOADS_DIR = path.join(BASE_DIR, "uploads");
const LEGACY_UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// React build luôn nằm cùng cấp server.js (trong asar hoặc dev)
const UI_BUILD = path.join(__dirname, "pos-ui", "build");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));
if (LEGACY_UPLOADS_DIR !== UPLOADS_DIR && fs.existsSync(LEGACY_UPLOADS_DIR)) {
  // Fallback ảnh cũ sau khi chuyển dữ liệu sang userData
  app.use("/uploads", express.static(LEGACY_UPLOADS_DIR));
}

// Serve React build nếu tồn tại (production)
if (fs.existsSync(UI_BUILD)) {
  app.use(express.static(UI_BUILD));
  console.log("✅ Serving UI từ:", UI_BUILD);
}

// =============================================
// MULTER – Upload ảnh món ăn hehehea
// =============================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// =============================================
// SQL.JS – Khởi tạo DB (load từ file hoặc tạo mới)
// =============================================

/**
 * sql.js hoạt động in-memory. Sau mỗi thay đổi (write),
 * ta gọi saveDb() để ghi xuống file .db trên disk.
 */
let db;
let saveTimeout = null;
let mongoClient = null;
let mongoDb = null;
let mongoReady = false;
let mongoConnectPromise = null;

function saveDb(immediate = false) {
  const writeNow = () => {
    try {
      const data = db.export(); // Uint8Array
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (e) {
      console.error("Lỗi lưu DB:", e.message);
    }
  };

  if (immediate) {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    writeNow();
    return;
  }

  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    writeNow();
  }, 500); // Tối ưu: gom lệnh (debounce) lưu file trong 500ms
}

function flushDbBeforeExit() {
  if (!db) return;
  saveDb(true);
}

async function connectMongoIfConfigured() {
  const uri = (process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.log("ℹ️  MongoDB chưa cấu hình, chạy với sql.js local");
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
  const dbName = (process.env.MONGODB_DB || "posextra").trim();
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
  const uri = (process.env.MONGODB_URI || "").trim();
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

async function syncMongoToSqliteCache() {
  if (!mongoReady) return;
  const collections = [
    ["menu", ["name", "price", "type", "image"]],
    ["tables", ["table_num", "status"]],
    ["bills", ["table_num", "total", "created_at"]],
    ["bill_items", ["bill_id", "name", "price", "qty", "item_type"]],
    ["settings", ["key", "value"]],
    ["windows_printers", ["name", "type", "paper_size", "is_enabled"]],
    ["order_session", ["payload"]],
  ];
  for (const [name] of collections) {
    db.run(`DELETE FROM ${name}`);
  }

  const menuDocs = await mongoDb.collection("menu").find({}).sort({ sqlite_id: 1 }).toArray();
  menuDocs.forEach((d) => {
    db.run("INSERT INTO menu (id,name,price,type,image) VALUES (?,?,?,?,?)", [
      Number(d.sqlite_id || d.id || 0),
      d.name || "",
      Number(d.price || 0),
      d.type || "FOOD",
      d.image || "",
    ]);
  });

  const tableDocs = await mongoDb.collection("tables").find({}).sort({ table_num: 1 }).toArray();
  tableDocs.forEach((d) => {
    db.run("INSERT INTO tables (table_num,status) VALUES (?,?)", [Number(d.table_num), d.status || "PAID"]);
  });

  const billDocs = await mongoDb.collection("bills").find({}).sort({ sqlite_id: 1 }).toArray();
  billDocs.forEach((d) => {
    db.run("INSERT INTO bills (id,table_num,total,created_at) VALUES (?,?,?,?)", [
      Number(d.sqlite_id || d.id || 0),
      Number(d.table_num || 0),
      Number(d.total || 0),
      d.created_at || "",
    ]);
  });

  const billItemDocs = await mongoDb.collection("bill_items").find({}).sort({ sqlite_id: 1 }).toArray();
  billItemDocs.forEach((d) => {
    db.run("INSERT INTO bill_items (id,bill_id,name,price,qty,item_type) VALUES (?,?,?,?,?,?)", [
      Number(d.sqlite_id || d.id || 0),
      Number(d.bill_id || 0),
      d.name || "",
      Number(d.price || 0),
      Number(d.qty || 0),
      d.item_type || null,
    ]);
  });

  const settingDocs = await mongoDb.collection("settings").find({}).toArray();
  settingDocs.forEach((d) => db.run("INSERT INTO settings (key,value) VALUES (?,?)", [d.key, d.value]));

  const printerDocs = await mongoDb.collection("windows_printers").find({}).sort({ sqlite_id: 1 }).toArray();
  printerDocs.forEach((d) => {
    db.run("INSERT INTO windows_printers (id,name,type,paper_size,is_enabled) VALUES (?,?,?,?,?)", [
      Number(d.sqlite_id || d.id || 0),
      d.name || "",
      d.type || "ALL",
      Number(d.paper_size || 80),
      Number(d.is_enabled ?? 1),
    ]);
  });

  const session = await mongoDb.collection("order_session").findOne({ id: 1 });
  db.run("INSERT OR REPLACE INTO order_session (id,payload) VALUES (1,?)", [session?.payload || "{}"]);
  saveDb(true);
  console.log("🔄 Mongo -> SQL cache synced");
}

process.on("beforeExit", flushDbBeforeExit);
process.on("exit", flushDbBeforeExit);
process.on("SIGINT", () => { flushDbBeforeExit(); process.exit(0); });
process.on("SIGTERM", () => { flushDbBeforeExit(); process.exit(0); });

/**
 * Chạy câu lệnh SELECT, trả về array of objects
 */
function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * Chạy câu lệnh SELECT, trả về 1 row object hoặc undefined
 */
function dbGet(sql, params = []) {
  const rows = dbAll(sql, params);
  return rows[0];
}

/**
 * Chạy câu lệnh INSERT / UPDATE / DELETE
 * Trả về { changes, lastInsertRowid }
 */
function dbRun(sql, params = [], options = {}) {
  const { skipMirror = false } = options;
  db.run(sql, params);
  const result = {
    changes:         db.getRowsModified(),
    lastInsertRowid: dbGet("SELECT last_insert_rowid() AS id")?.id,
  };
  if (mongoReady && !skipMirror) {
    mirrorWriteToMongo(sql, params, result).catch((e) => {
      console.error("⚠️  Mongo mirror write lỗi:", e.message);
    });
  }
  return result;
}

async function mirrorWriteToMongo(sql, params, result) {
  if (!mongoReady) return;
  const q = sql.replace(/\s+/g, " ").trim().toUpperCase();

  if (q.startsWith("INSERT INTO MENU")) {
    await mongoDb.collection("menu").insertOne({
      sqlite_id: Number(result.lastInsertRowid),
      name: params[0],
      price: Number(params[1] || 0),
      type: params[2],
      image: params[3] || "",
    });
    return;
  }
  if (q.startsWith("UPDATE MENU SET NAME=?, PRICE=?, TYPE=?, IMAGE=? WHERE ID=?")) {
    await mongoDb.collection("menu").updateOne(
      { sqlite_id: Number(params[4]) },
      { $set: { name: params[0], price: Number(params[1] || 0), type: params[2], image: params[3] || "" } }
    );
    return;
  }
  if (q.startsWith("UPDATE MENU SET NAME=?, PRICE=?, TYPE=? WHERE ID=?")) {
    await mongoDb.collection("menu").updateOne(
      { sqlite_id: Number(params[3]) },
      { $set: { name: params[0], price: Number(params[1] || 0), type: params[2] } }
    );
    return;
  }
  if (q.startsWith("DELETE FROM MENU WHERE ID=?")) {
    await mongoDb.collection("menu").deleteOne({ sqlite_id: Number(params[0]) });
    return;
  }

  if (q.startsWith("INSERT OR REPLACE INTO ORDER_SESSION")) {
    await mongoDb.collection("order_session").updateOne(
      { id: 1 },
      { $set: { id: 1, payload: params[0] || "{}" } },
      { upsert: true }
    );
    return;
  }

  if (q.startsWith("INSERT OR REPLACE INTO TABLES")) {
    await mongoDb.collection("tables").updateOne(
      { table_num: Number(params[0]) },
      { $set: { table_num: Number(params[0]), status: params[1] } },
      { upsert: true }
    );
    return;
  }
  if (q.startsWith("INSERT INTO TABLES")) {
    await mongoDb.collection("tables").updateOne(
      { table_num: Number(params[0]) },
      { $set: { table_num: Number(params[0]), status: "PAID" } },
      { upsert: true }
    );
    return;
  }
  if (q.startsWith("UPDATE TABLES SET TABLE_NUM=? WHERE TABLE_NUM=?")) {
    await mongoDb.collection("tables").updateOne({ table_num: Number(params[1]) }, { $set: { table_num: Number(params[0]) } });
    return;
  }
  if (q.startsWith("DELETE FROM TABLES WHERE TABLE_NUM=?")) {
    await mongoDb.collection("tables").deleteOne({ table_num: Number(params[0]) });
    return;
  }

  if (q.startsWith("INSERT INTO BILLS")) {
    await mongoDb.collection("bills").insertOne({
      sqlite_id: Number(result.lastInsertRowid),
      table_num: Number(params[0]),
      total: Number(params[1] || 0),
      created_at: params[2],
    });
    return;
  }
  if (q.startsWith("INSERT INTO BILL_ITEMS")) {
    await mongoDb.collection("bill_items").insertOne({
      sqlite_id: Number(result.lastInsertRowid),
      bill_id: Number(params[0]),
      name: params[1],
      price: Number(params[2] || 0),
      qty: Number(params[3] || 0),
      item_type: params[4] || null,
    });
    return;
  }

  if (q.startsWith("INSERT INTO WINDOWS_PRINTERS")) {
    await mongoDb.collection("windows_printers").insertOne({
      sqlite_id: Number(result.lastInsertRowid),
      name: params[0],
      type: params[1] || "ALL",
      paper_size: Number(params[2] || 80),
      is_enabled: Number(params[3] ?? 1),
    });
    return;
  }
  if (q.startsWith("UPDATE WINDOWS_PRINTERS SET")) {
    await mongoDb.collection("windows_printers").updateOne(
      { sqlite_id: Number(params[4]) },
      { $set: { name: params[0], type: params[1], paper_size: Number(params[2] || 80), is_enabled: Number(params[3] ?? 1) } }
    );
    return;
  }
  if (q.startsWith("DELETE FROM WINDOWS_PRINTERS WHERE ID=?")) {
    await mongoDb.collection("windows_printers").deleteOne({ sqlite_id: Number(params[0]) });
    return;
  }

  if (q.startsWith("INSERT INTO SETTINGS")) {
    await mongoDb.collection("settings").updateOne(
      { key: params[0] },
      { $set: { key: params[0], value: params[1] } },
      { upsert: true }
    );
  }
}

function seedMenuIfEmpty() {
  const row = dbGet("SELECT COUNT(*) AS total FROM menu");
  const total = Number(row?.total || 0);
  if (total > 0) {
    console.log(`ℹ️  Menu seed skipped: đã có ${total} món`);
    return;
  }
  menuSeedItems.forEach((item) => {
    dbRun(
      "INSERT INTO menu (name, price, type, image) VALUES (?, ?, ?, ?)",
      [item.name, Number(item.price), item.type, ""]
    );
  });
  saveDb(true);
  console.log(`🌱 Menu seed executed: đã nạp ${menuSeedItems.length} món mặc định`);
}

/**
 * Khởi tạo sql.js, load file DB nếu đã có, rồi khởi động Express
 */
async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log("✅ Đã load DB từ file:", DB_PATH);
  } else {
    db = new SQL.Database();
    console.log("✅ Tạo DB mới:", DB_PATH);
  }

  // Tạo bảng nếu chưa có
  db.run(`
    CREATE TABLE IF NOT EXISTS menu (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT,
      price INTEGER,
      type  TEXT,
      image TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS bills (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      table_num  INTEGER,
      total      INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS bill_items (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id  INTEGER,
      name     TEXT,
      price    INTEGER,
      qty      INTEGER,
      FOREIGN KEY (bill_id) REFERENCES bills(id)
    )
  `);
  try {
    db.run("ALTER TABLE bill_items ADD COLUMN item_type TEXT");
  } catch {
    /* đã có cột */
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS tables (
      table_num  INTEGER PRIMARY KEY,
      status     TEXT DEFAULT 'PAID'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS windows_printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      type TEXT,
      paper_size INTEGER,
      is_enabled INTEGER DEFAULT 1
    )
  `);

  // Đơn đang gọi (chưa reset bàn) — khôi phục sau khi tắt mở app
  db.run(`
    CREATE TABLE IF NOT EXISTS order_session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL DEFAULT '{}'
    )
  `);
  if (!dbGet("SELECT id FROM order_session WHERE id=1")) {
    db.run("INSERT INTO order_session (id, payload) VALUES (1, '{}')");
  }

  // Giá trị mặc định settings
  const defaultSettings = [
    ["printer_ip",    ""],
    ["printer_type",  ""],
    ["store_name",    ""],
    ["store_address", ""],
    ["store_phone",   ""],
    ["cashier_name",  ""],
    ["total_tables",  "20"],
    ["bill_css_override", ""],
  ];
  defaultSettings.forEach(([k, v]) => {
    db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [k, v]);
  });

  await connectMongoIfConfigured();
  if (mongoReady) {
    await seedMongoMenuIfEmpty();
    await syncMongoToSqliteCache();
  } else {
    seedMenuIfEmpty();
  }
  saveDb();
  startServer();
}

// =============================================
// MENU APIs
// =============================================

function startServer() {

  // Lấy toàn bộ menu
  app.get("/menu", (req, res) => {
    res.json(dbAll("SELECT * FROM menu"));
  });

  // Thêm món mới
  app.post("/menu", upload.single("image"), async (req, res) => {
    const { name, price, type } = req.body;
    const image = req.file ? req.file.filename : "";
    const result = dbRun(
      "INSERT INTO menu (name, price, type, image) VALUES (?, ?, ?, ?)",
      [name, Number(price), type, image],
      { skipMirror: mongoReady }
    );
    let mongoSaved = false;
    let mongoError = null;
    const mongoOk = await ensureMongoReady();
    if (mongoOk) {
      try {
        await mongoDb.collection("menu").insertOne({
          sqlite_id: Number(result.lastInsertRowid),
          name,
          price: Number(price || 0),
          type,
          image: image || "",
        });
        mongoSaved = true;
      } catch (e) {
        mongoError = e.message || String(e);
      }
    }
    saveDb();
    res.json({ added: true, mongoSaved, mongoError });
  });

  // Cập nhật món
  app.put("/menu/:id", upload.single("image"), async (req, res) => {
    const { name, price, type } = req.body;
    const { id } = req.params;
    if (req.file) {
      dbRun(
        "UPDATE menu SET name=?, price=?, type=?, image=? WHERE id=?",
        [name, Number(price), type, req.file.filename, id],
        { skipMirror: mongoReady }
      );
    } else {
      dbRun(
        "UPDATE menu SET name=?, price=?, type=? WHERE id=?",
        [name, Number(price), type, id],
        { skipMirror: mongoReady }
      );
    }
    let mongoSaved = false;
    let mongoError = null;
    const mongoOk = await ensureMongoReady();
    if (mongoOk) {
      try {
        const patch = { name, price: Number(price || 0), type };
        if (req.file) patch.image = req.file.filename;
        await mongoDb.collection("menu").updateOne(
          { sqlite_id: Number(id) },
          { $set: patch }
        );
        mongoSaved = true;
      } catch (e) {
        mongoError = e.message || String(e);
      }
    }
    saveDb();
    res.json({ updated: true, mongoSaved, mongoError });
  });

  // Xóa món
  app.delete("/menu/:id", async (req, res) => {
    dbRun("DELETE FROM menu WHERE id=?", [req.params.id], { skipMirror: mongoReady });
    let mongoSaved = false;
    let mongoError = null;
    const mongoOk = await ensureMongoReady();
    if (mongoOk) {
      try {
        await mongoDb.collection("menu").deleteOne({ sqlite_id: Number(req.params.id) });
        mongoSaved = true;
      } catch (e) {
        mongoError = e.message || String(e);
      }
    }
    saveDb();
    res.json({ deleted: true, mongoSaved, mongoError });
  });

  // =============================================
  // ORDER SESSION (đơn đang order — lưu DB)
  // =============================================

  app.get("/order-session", (req, res) => {
    const row = dbGet("SELECT payload FROM order_session WHERE id=1");
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

  app.put("/order-session", (req, res) => {
    const { tableOrders = {}, itemNotes = {}, kitchenSent = {} } = req.body || {};
    const payload = JSON.stringify({ tableOrders, itemNotes, kitchenSent });
    dbRun("INSERT OR REPLACE INTO order_session (id, payload) VALUES (1, ?)", [payload]);
    saveDb();
    res.json({ ok: true });
  });

  // =============================================
  // TABLE STATUS APIs
  // =============================================

  // Lấy trạng thái tất cả bàn
  app.get("/tables", (req, res) => {
    res.json(dbAll("SELECT * FROM tables"));
  });

  // Cập nhật trạng thái bàn
  app.post("/tables/:num/status", (req, res) => {
    const { num } = req.params;
    const { status } = req.body;
    dbRun(
      "INSERT OR REPLACE INTO tables (table_num, status) VALUES (?, ?)",
      [Number(num), status]
    );
    saveDb();
    res.json({ updated: true });
  });

  // Thêm bàn mới
  app.post("/tables", (req, res) => {
    const { table_num } = req.body;
    if (!table_num) return res.status(400).json({ error: "Thiếu số bàn" });

    const existing = dbGet("SELECT * FROM tables WHERE table_num=?", [Number(table_num)]);
    if (existing) return res.status(409).json({ error: "Bàn đã tồn tại" });

    dbRun("INSERT INTO tables (table_num, status) VALUES (?, 'PAID')", [Number(table_num)]);
    saveDb();
    res.json({ added: true, table_num: Number(table_num) });
  });

  // Đổi số bàn
  app.put("/tables/:num", (req, res) => {
    const oldNum = Number(req.params.num);
    const { new_num } = req.body;
    if (!new_num) return res.status(400).json({ error: "Thiếu số bàn mới" });

    const existing = dbGet("SELECT * FROM tables WHERE table_num=?", [Number(new_num)]);
    if (existing) return res.status(409).json({ error: `Bàn ${new_num} đã tồn tại` });

    try {
      dbRun("UPDATE tables SET table_num=? WHERE table_num=?", [Number(new_num), oldNum]);
      saveDb();
      res.json({ updated: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Xóa bàn
  app.delete("/tables/:num", (req, res) => {
    const num = Number(req.params.num);
    const busy = dbGet("SELECT * FROM tables WHERE table_num=? AND status='OPEN'", [num]);
    if (busy) return res.status(400).json({ error: "Bàn đang có khách, không thể xóa" });
    dbRun("DELETE FROM tables WHERE table_num=?", [num]);
    saveDb();
    res.json({ deleted: true });
  });

  // =============================================
  // BILLS APIs
  // =============================================

  // Tạo hóa đơn mới
  app.post("/bills", (req, res) => {
    const { table_num, total, items } = req.body;

    // Chèn bill header – sql.js không hỗ trợ DEFAULT datetime khi run(),
    // nên ta tự truyền thời gian vào
    const now = new Date().toLocaleString("sv-SE").replace("T", " "); // "YYYY-MM-DD HH:MM:SS"
    dbRun(
      "INSERT INTO bills (table_num, total, created_at) VALUES (?, ?, ?)",
      [table_num, total, now]
    );
    const billId = dbGet("SELECT last_insert_rowid() AS id")?.id;

    // Chèn từng item
    items.forEach(item => {
      dbRun(
        "INSERT INTO bill_items (bill_id, name, price, qty, item_type) VALUES (?, ?, ?, ?, ?)",
        [billId, item.name, item.price, item.qty, item.type || null]
      );
    });

    // Đánh dấu bàn PAID
    dbRun(
      "INSERT OR REPLACE INTO tables (table_num, status) VALUES (?, 'PAID')",
      [table_num]
    );

    // Hóa đơn vừa thanh toán cần bền vững ngay cả khi người dùng tắt app liền
    saveDb(true);
    res.json({ bill_id: billId });
  });

  // Lịch sử hóa đơn theo ngày
  app.get("/bills", (req, res) => {
    const date = req.query.date || new Date().toISOString().split("T")[0];
    const rows = dbAll(
      `SELECT b.id, b.table_num, b.total, b.created_at,
              GROUP_CONCAT(bi.name || ' x' || bi.qty, ', ') AS items_summary
       FROM bills b
       LEFT JOIN bill_items bi ON bi.bill_id = b.id
       WHERE DATE(b.created_at) = ?
       GROUP BY b.id
       ORDER BY b.created_at DESC`,
      [date]
    );
    res.json(rows);
  });

  // Chi tiết 1 hóa đơn
  app.get("/bills/:id", (req, res) => {
    const { id } = req.params;
    const bill = dbGet("SELECT * FROM bills WHERE id=?", [id]);
    if (!bill) return res.status(404).json({ error: "Not found" });
    const items = dbAll("SELECT * FROM bill_items WHERE bill_id=?", [id]);
    res.json({ ...bill, items });
  });

  // =============================================
  // THỐNG KÊ DOANH THU
  // =============================================

  // Doanh thu theo ngày trong tháng
  app.get("/stats/daily", (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const rows = dbAll(
      `SELECT DATE(created_at) AS date,
              COUNT(*)         AS bill_count,
              SUM(total)       AS revenue
       FROM bills
       WHERE strftime('%Y-%m', created_at) = ?
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [month]
    );
    res.json(rows);
  });

  // Stats theo tháng (gộp theo ngày trong tháng đó)
  app.get("/stats/monthly", (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const rows = dbAll(
      `SELECT DATE(created_at) AS date, COUNT(*) AS bill_count, COALESCE(SUM(total),0) AS revenue
       FROM bills WHERE strftime('%Y-%m', created_at) = ?
       GROUP BY DATE(created_at) ORDER BY date ASC`, [month]);
    const summary = dbGet(
      `SELECT COUNT(*) AS bill_count, COALESCE(SUM(total),0) AS revenue
       FROM bills WHERE strftime('%Y-%m', created_at) = ?`, [month]);
    const topItems = dbAll(
      `SELECT bi.name, SUM(bi.qty) AS total_qty, SUM(bi.price*bi.qty) AS total_revenue
       FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
       WHERE strftime('%Y-%m', b.created_at) = ?
       GROUP BY bi.name ORDER BY total_qty DESC LIMIT 5`, [month]);
    res.json({ ...summary, days: rows, top_items: topItems });
  });

  // Stats theo năm (gộp theo tháng)
  app.get("/stats/yearly", (req, res) => {
    const year = req.query.year || new Date().getFullYear().toString();
    const rows = dbAll(
      `SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS bill_count, COALESCE(SUM(total),0) AS revenue
       FROM bills WHERE strftime('%Y', created_at) = ?
       GROUP BY strftime('%Y-%m', created_at) ORDER BY month ASC`, [year]);
    const summary = dbGet(
      `SELECT COUNT(*) AS bill_count, COALESCE(SUM(total),0) AS revenue
       FROM bills WHERE strftime('%Y', created_at) = ?`, [year]);
    const topItems = dbAll(
      `SELECT bi.name, SUM(bi.qty) AS total_qty, SUM(bi.price*bi.qty) AS total_revenue
       FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
       WHERE strftime('%Y', b.created_at) = ?
       GROUP BY bi.name ORDER BY total_qty DESC LIMIT 5`, [year]);
    res.json({ ...summary, months: rows, top_items: topItems });
  });

  // Tổng quan hôm nay
  app.get("/stats/today", (req, res) => {
    const today = new Date().toISOString().split("T")[0];
    const summary = dbGet(
      `SELECT COUNT(*) AS bill_count, COALESCE(SUM(total),0) AS revenue
       FROM bills WHERE DATE(created_at) = ?`,
      [today]
    );
    const topItems = dbAll(
      `SELECT bi.name, SUM(bi.qty) AS total_qty, SUM(bi.price * bi.qty) AS total_revenue
       FROM bill_items bi
       JOIN bills b ON b.id = bi.bill_id
       WHERE DATE(b.created_at) = ?
       GROUP BY bi.name
       ORDER BY total_qty DESC
       LIMIT 5`,
      [today]
    );
    res.json({ ...summary, top_items: topItems });
  });

  // =============================================
  // PRINTER CONFIG
  // =============================================

  function getPrinterIP() {
    const row = dbGet("SELECT value FROM settings WHERE key='printer_ip'");
    return row?.value || "";
  }

  function getSetting(key, fallback = "") {
    const row = dbGet("SELECT value FROM settings WHERE key=?", [key]);
    const value = row?.value;
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

  async function createPrinter(ip) {
    const printerIP = ip || getPrinterIP();
    return createSafePrinter({
      type:      PrinterTypes.EPSON,
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

  app.get("/windows_printers", (req, res) => {
    res.json(dbAll("SELECT * FROM windows_printers"));
  });

  app.post("/windows_printers", (req, res) => {
    const { name, type, paper_size, is_enabled } = req.body;
    if (!name) return res.status(400).json({ error: "Thiếu tên máy in" });
    try {
      dbRun(
        "INSERT INTO windows_printers (name, type, paper_size, is_enabled) VALUES (?, ?, ?, ?)",
        [name, type || "ALL", Number(paper_size) || 80, is_enabled !== undefined ? is_enabled : 1]
      );
      saveDb();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/windows_printers/:id", (req, res) => {
    const { name, type, paper_size, is_enabled } = req.body;
    try {
      dbRun(
        "UPDATE windows_printers SET name=?, type=?, paper_size=?, is_enabled=? WHERE id=?",
        [name, type, Number(paper_size), is_enabled, req.params.id]
      );
      saveDb();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/windows_printers/:id", (req, res) => {
    try {
      dbRun("DELETE FROM windows_printers WHERE id=?", [req.params.id]);
      saveDb();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/settings", (req, res) => {
    const rows = dbAll("SELECT key, value FROM settings");
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  });

  app.post("/settings", (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: "Missing key" });
    try {
      dbRun(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [key, value]
      );
      saveDb();
      res.json({ success: true, key, value });
    } catch (e) {
      res.status(500).json({ error: e.message });
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
        const printer   = await createPrinter(trimmedIp);
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

  function escapeHtml(input) {
    return String(input ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Giá trong DB/API là đơn vị nghìn (12 = 12.000đ), giống formatMoney ở pos-ui */
  function formatMoney(value) {
    const n = Number(value) || 0;
    return new Intl.NumberFormat("vi-VN").format(n * 1000) + "đ";
  }

  function getEnabledPrintersByType(type) {
    return dbAll(
      "SELECT * FROM windows_printers WHERE is_enabled=1 AND (type=? OR type='ALL')",
      [type]
    );
  }

  function getBillCssOverride() {
    const row = dbGet("SELECT value FROM settings WHERE key='bill_css_override'");
    return row?.value || "";
  }

  function buildReceiptHtml({
    title,
    subtitle,
    tableNum,
    timeLabel,
    timeValue,
    items,
    totalLabel,
    totalValue,
    footer,
    billNo,
    cashier,
    customer,
    hidePrices = false,
    groupItemsByType = false,
  }, paperSize = 80, cssOverride) {
    const pageWidth = Number(paperSize) === 58 ? "58mm" : "80mm";

    function renderOneItemRow(item, idx) {
      const qty = Number(item.qty) || 0;
      const lineTotal = (Number(item.price) || 0) * qty;
      const noteHtml = item.note
        ? `<div class="item-note">- ${escapeHtml(item.note)}</div>`
        : "";
      if (hidePrices) {
        return `
        <div class="item">
          <div class="item-row">
            <span class="item-name">${idx + 1}) ${escapeHtml(item.name)}</span>
            <span class="item-qty">${qty}</span>
          </div>
          ${noteHtml}
        </div>
      `;
      }
      return `
        <div class="item">
          <div class="item-row">
            <span class="item-name">${idx + 1}) ${escapeHtml(item.name)}</span>
            <span class="item-qty">${qty}</span>
            <span class="item-unit-price">${formatMoney(item.price)}</span>
            <span class="item-price">${formatMoney(lineTotal)}</span>
          </div>
          ${noteHtml}
        </div>
      `;
    }

    function getItemType(i) {
      const t = i.type ?? i.item_type;
      return t === "DRINK" ? "DRINK" : "FOOD";
    }

    const list = items || [];
    let itemHtml = "";

    if (groupItemsByType && !hidePrices) {
      const foods = list.filter((i) => getItemType(i) !== "DRINK");
      const drinks = list.filter((i) => getItemType(i) === "DRINK");
      const parts = [];
      let idx = 0;
      if (foods.length) {
        parts.push(`<div class="item-group-label">Đồ ăn &amp; combo</div>`);
        foods.forEach((item) => {
          parts.push(renderOneItemRow(item, idx));
          idx += 1;
        });
      }
      if (drinks.length) {
        parts.push(`<div class="item-group-label">Đồ uống</div>`);
        drinks.forEach((item) => {
          parts.push(renderOneItemRow(item, idx));
          idx += 1;
        });
      }
      itemHtml = parts.length ? parts.join("") : list.map((item, i) => renderOneItemRow(item, i)).join("");
    } else {
      itemHtml = list.map((item, idx) => renderOneItemRow(item, idx)).join("");
    }

    const summaryHtml = totalValue !== undefined
      ? `
        <div class="summary">
          <span class="sum-label">${escapeHtml(totalLabel || "TONG CONG")}</span>
          <span class="sum-value">${formatMoney(totalValue)}</span>
        </div>
      `
      : "";

    const footerHtml = footer ? `<div class="footer">${escapeHtml(footer)}</div>` : "";

    const finalCssOverride = typeof cssOverride === "string" ? cssOverride : getBillCssOverride();

    const upperTitle = String(title || "").toUpperCase();
    const documentTitle = upperTitle.includes("BEP")
      ? "PHIẾU BẾP"
      : upperTitle.includes("PHA CHE")
      ? "PHIẾU PHA CHẾ"
      : totalLabel === "TẠM TÍNH" || totalLabel === "TAM TINH"
      ? "PHIẾU TẠM TÍNH"
      : "HÓA ĐƠN THANH TOÁN";

    const theadHtml = hidePrices
      ? `<div class="thead">
      <span>TÊN HÀNG</span>
      <span>SL</span>
    </div>`
      : `<div class="thead">
      <span>TÊN HÀNG</span>
      <span>SL</span>
      <span>ĐƠN GIÁ</span>
      <span>T.TIỀN</span>
    </div>`;

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: ${pageWidth} auto; margin: 2mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: ${pageWidth};
      min-height: 100vh;
      color: #000;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.32;
      font-weight: 400;
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: antialiased;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      display: flex;
      justify-content: center;
    }
    .wrap {
      width: calc(${pageWidth} - 4mm);
      max-width: calc(${pageWidth} - 4mm);
      padding: 2mm 2mm 1.6mm;
    }
    .title {
      text-align: center;
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.2px;
      text-transform: uppercase;
    }
    .subtitle {
      text-align: center;
      font-size: 11px;
      font-weight: 400;
      margin-top: 1px;
      opacity: 0.9;
    }
    .section-title {
      text-align: center;
      font-size: 13px;
      font-weight: 600;
      margin: 7px 0 3px;
      text-transform: uppercase;
      letter-spacing: 0.1px;
    }
    .meta-grid {
      margin-top: 2px;
      margin-bottom: 6px;
    }
    .meta-line {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      font-size: 11px;
      font-weight: 400;
    }
    .meta-line b { font-weight: 600; }
    .divider {
      border-top: 1px solid #000;
      margin: 3px 0;
      opacity: 0.7;
    }
    .wrap.receipt-no-prices .thead,
    .wrap.receipt-no-prices .item-row {
      grid-template-columns: 1fr 40px;
    }
    .wrap.receipt-no-prices .thead span:nth-child(2),
    .wrap.receipt-no-prices .item-qty {
      text-align: right;
    }
    .thead, .item-row, .summary {
      display: grid;
      grid-template-columns: 1fr 24px 52px 58px;
      align-items: baseline;
      column-gap: 3px;
    }
    .thead {
      font-size: 10px;
      font-weight: 600;
      margin: 4px 0 2px;
      letter-spacing: 0.1px;
    }
    .thead span:nth-child(2),
    .thead span:nth-child(3),
    .thead span:nth-child(4) {
      text-align: right;
    }
    .item { margin-bottom: 1px; }
    .item-row {
      font-size: 11px;
    }
    .item-name {
      overflow-wrap: anywhere;
      font-weight: 700;
    }
    .item-qty,
    .item-unit-price,
    .item-price {
      text-align: center;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
    }
    .item-unit-price,
    .item-price {
      text-align: right;
    }
    .item-group-label {
      font-size: 10px;
      font-weight: 700;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.15px;
      margin: 7px 0 4px;
      padding-top: 5px;
      border-top: 1px dashed #888;
    }
    .item-group-label:first-child {
      margin-top: 0;
      padding-top: 0;
      border-top: none;
    }
    .item-note {
      margin-top: 1px;
      margin-left: 10px;
      font-size: 10px;
      font-weight: 400;
      font-style: italic;
      opacity: 0.9;
    }
    .summary {
      font-size: 12px;
      font-weight: 600;
      margin-top: 2px;
    }
    .summary .sum-label {
      grid-column: 1 / span 3;
    }
    .summary .sum-value {
      text-align: right;
    }
    .footer {
      text-align: center;
      margin-top: 7px;
      font-size: 10px;
      font-weight: 500;
      opacity: 0.9;
    }
    ${finalCssOverride || ""}
  </style>
</head>
<body>
  <div class="wrap${hidePrices ? " receipt-no-prices" : ""}">
    <div class="title">${escapeHtml(title || "PHIẾU IN")}</div>
    ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}
    <div class="section-title">${escapeHtml(documentTitle)}</div>
    <div class="meta-grid">
      <div class="meta-line"><span>Số HĐ</span><b>${escapeHtml(billNo || "--")}</b></div>
      <div class="meta-line"><span>${escapeHtml(timeLabel || "Thoi gian")}</span><b>${escapeHtml(timeValue)}</b></div>
      <div class="meta-line"><span>Bàn</span><b>${escapeHtml(tableNum)}</b></div>
      <div class="meta-line"><span>Thu ngân</span><b>${escapeHtml(cashier || getStoreProfile().cashierName)}</b></div>
      <div class="meta-line"><span>Khách hàng</span><b>${escapeHtml(customer || "")}</b></div>
    </div>
    <div class="divider"></div>
    ${theadHtml}
    <div class="divider"></div>
    ${itemHtml || "<div>Không có món nào.</div>"}
    ${summaryHtml ? `<div class="divider"></div>${summaryHtml}` : ""}
    ${footerHtml}
  </div>
</body>
</html>
    `;
  }

  function dispatchReceiptToType(type, receiptData) {
    if (typeof global.printHtmlToDevice !== "function") {
      const err = new Error("Không hỗ trợ in ngầm ngoài môi trường Electron");
      err.statusCode = 503;
      throw err;
    }

    const printers = getEnabledPrintersByType(type);
    if (!printers.length) {
      const err = new Error(`Chưa cấu hình máy in cho loại ${type}`);
      err.statusCode = 503;
      throw err;
    }

    printers.forEach((printer) => {
      const html = buildReceiptHtml(receiptData, printer.paper_size || 80);
      console.log(`🖨️  [${type}] In HTML tới máy: ${printer.name}`);
      global.printHtmlToDevice(html, printer.name, { paperSize: printer.paper_size || 80 });
    });

    return printers.length;
  }

  // In phiếu bếp (Tách Đồ ăn -> Bếp, Nước uống -> Bill/Pha chế)
  app.post("/print/kitchen", async (req, res) => {
    const { table_num, items = [] } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Danh sách món không hợp lệ" });
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
  app.post("/print/tamtinh", async (req, res) => {
    const { table_num, items = [], total } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Danh sách món không hợp lệ" });
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
        footer: "(Chưa thanh toán chính thức)",
        groupItemsByType: true,
      });
      res.json({ success: true, queued: sent });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // In hóa đơn tài chính
  app.post("/print/bill", async (req, res) => {
    const { table_num, items = [], total } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Danh sách món không hợp lệ" });
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
        footer: "Cảm ơn quý khách - Hẹn gặp lại!",
        groupItemsByType: true,
      });
      res.json({ success: true, queued: sent });
    } catch (err) {
      console.error("Lỗi in hóa đơn:", err);
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // In lại hóa đơn từ lịch sử
  app.post("/print/bill/:id", async (req, res) => {
    const { id } = req.params;
    const bill = dbGet("SELECT * FROM bills WHERE id=?", [id]);
    if (!bill) return res.status(404).json({ error: "Không tìm thấy hóa đơn" });

    const items = dbAll("SELECT * FROM bill_items WHERE bill_id=?", [id]);
    try {
      const store = getStoreProfile();
      const sent = dispatchReceiptToType("BILL", {
        title: store.storeName,
        subtitle: store.storeSubtitle,
        tableNum: bill.table_num,
        timeLabel: "Ngày",
        timeValue: new Date(bill.created_at).toLocaleString("vi-VN"),
        items,
        totalLabel: "THÀNH TIỀN",
        totalValue: bill.total,
        billNo: bill.id,
        cashier: store.cashierName,
        footer: "*** IN LẠI ***  -  Cảm ơn quý khách!",
        groupItemsByType: true,
      });
      res.json({ success: true, queued: sent });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // Kiểm tra kết nối máy in
  app.get("/print/status", async (req, res) => {
    const printers = dbAll("SELECT name FROM windows_printers WHERE is_enabled=1");
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
    res.json({ connected: allConnected, count: printers.length });
  });

  // Mở cửa sổ Log Electron từ React UI
  app.post("/open-log", (req, res) => {
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

    const printers = dbAll("SELECT name, paper_size FROM windows_printers WHERE is_enabled=1 AND (type=? OR type='ALL')", [type]);
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
  app.listen(3000, () => {
    console.log("✅ Server đang chạy tại http://localhost:3000");
    const printerIp = getPrinterIP();
    console.log(`🖨️  Máy in POS: ${printerIp ? `tcp://${printerIp}` : "chưa cấu hình"}`);
    console.log("   → Cấu hình IP máy in qua giao diện Settings");
  });
}

// Khởi động
initDb().catch(err => {
  console.error("❌ Không thể khởi tạo DB:", err);
  process.exit(1);
});