const express = require("express");
const cors    = require("cors");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const { exec } = require("child_process");
const { ThermalPrinter, PrinterTypes, CharacterSet } = require("node-thermal-printer");

// DUMMY WINDOWS DRIVER ĐỂ IN RAW QUA WINDOWS SPOOLER KHÔNG DÙNG C++ (Bypass lỗi No driver set)
class WindowsRawDriver {
  getPrinters() { return []; }
  getPrinter(name) { return { name, status: 'READY' }; }
  printDirect({ data, printer, success, error }) {
    try {
      const psSuffix = Date.now() + Math.floor(Math.random() * 10000);
      const tmpBin = path.join(require('os').tmpdir(), `print_${psSuffix}.bin`);
      const tmpPsfile = path.join(require('os').tmpdir(), `print_${psSuffix}.ps1`);
      
      fs.writeFileSync(tmpBin, data);
      
      const psScript = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, IntPtr pBytes, int dwCount) {
        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        bool bSuccess = false;
        di.pDocName = "RAW POS Print";
        di.pDataType = "RAW";
        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    int dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pBytes, dwCount, out dwWritten);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}
"@
Add-Type -TypeDefinition $code -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes('${tmpBin.replace(/\\/g, '\\\\')}')
$hGlobal = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $hGlobal, $bytes.Length)
[RawPrinterHelper]::SendBytesToPrinter('${printer}', $hGlobal, $bytes.Length)
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($hGlobal)
Remove-Item -Path '${tmpBin.replace(/\\/g, '\\\\')}' -ErrorAction SilentlyContinue
`;
      fs.writeFileSync(tmpPsfile, psScript);
      require('child_process').exec(`powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tmpPsfile}"`, (err, stdout, stderr) => {
        try { fs.unlinkSync(tmpPsfile); } catch(e){}
        if (err) return error(err);
        success();
      });
    } catch(e) {
      error(e);
    }
  }
}
const customDriver = new WindowsRawDriver();

function createSafePrinter(config) {
  const printer = new ThermalPrinter(config);
  return printer;
}


// ── sql.js (pure JavaScript SQLite – không cần compile native) ────
const initSqlJs = require("sql.js");

// ── Đường dẫn lưu dữ liệu: ưu tiên userData để bền vững sau khi tắt/mở app ──
const RESOURCES_DIR = process.resourcesPath ? path.join(process.resourcesPath) : path.join(__dirname);
const USER_DATA_DIR = process.env.ELECTRON_USER_DATA ? path.join(process.env.ELECTRON_USER_DATA) : "";
const BASE_DIR = USER_DATA_DIR || RESOURCES_DIR;

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

const DB_PATH = path.join(BASE_DIR, "pos.db");
const LEGACY_DB_PATH = path.join(RESOURCES_DIR, "pos.db");
if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
  try {
    fs.copyFileSync(LEGACY_DB_PATH, DB_PATH);
    console.log("✅ Đã migrate pos.db sang userData:", DB_PATH);
  } catch (e) {
    console.error("⚠️  Không thể migrate pos.db:", e.message);
  }
}

const UPLOADS_DIR = path.join(BASE_DIR, "uploads");
const LEGACY_UPLOADS_DIR = path.join(RESOURCES_DIR, "uploads");
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
// MULTER – Upload ảnh món ăn
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
function dbRun(sql, params = []) {
  db.run(sql, params);
  return {
    changes:         db.getRowsModified(),
    lastInsertRowid: dbGet("SELECT last_insert_rowid() AS id")?.id,
  };
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
    ["admin_password", "123456"],
    ["printer_ip",    "192.168.1.100"],
    ["printer_type",  "EPSON"],
    ["store_name",    "Tiệm Nướng Đà Lạt Và Em"],
    ["store_address", "24 đường 3 tháng 4, Đà Lạt"],
    ["store_phone",   "081 366 5665"],
    ["total_tables",  "20"],
    ["bill_css_override", ""],
  ];
  defaultSettings.forEach(([k, v]) => {
    db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [k, v]);
  });

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
  app.post("/menu", upload.single("image"), (req, res) => {
    const { name, price, type } = req.body;
    const image = req.file ? req.file.filename : "";
    dbRun(
      "INSERT INTO menu (name, price, type, image) VALUES (?, ?, ?, ?)",
      [name, Number(price), type, image]
    );
    saveDb();
    res.json({ added: true });
  });

  // Cập nhật món
  app.put("/menu/:id", upload.single("image"), (req, res) => {
    const { name, price, type } = req.body;
    const { id } = req.params;
    if (req.file) {
      dbRun(
        "UPDATE menu SET name=?, price=?, type=?, image=? WHERE id=?",
        [name, Number(price), type, req.file.filename, id]
      );
    } else {
      dbRun(
        "UPDATE menu SET name=?, price=?, type=? WHERE id=?",
        [name, Number(price), type, id]
      );
    }
    saveDb();
    res.json({ updated: true });
  });

  // Xóa món
  app.delete("/menu/:id", (req, res) => {
    dbRun("DELETE FROM menu WHERE id=?", [req.params.id]);
    saveDb();
    res.json({ deleted: true });
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
    return row?.value || "192.168.1.100";
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
  app.get("/printers", (req, res) => {
    const cmd = `powershell -command "Get-Printer | Select-Object Name, PortName, PrinterStatus | ConvertTo-Json"`;
    exec(cmd, { timeout: 5000 }, (err, stdout) => {
      if (err) return res.json([]);
      try {
        let printers = JSON.parse(stdout.trim());
        if (!Array.isArray(printers)) printers = [printers];
        res.json(printers.map(p => ({
          name:   p.Name,
          port:   p.PortName,
          status: p.PrinterStatus === 0 ? "Ready" : "Unknown",
        })));
      } catch {
        res.json([]);
      }
    });
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

  // =============================================
  // AUTH (LOGIN) API
  // =============================================
  app.post("/login", (req, res) => {
    const { password } = req.body;
    const row = dbGet("SELECT value FROM settings WHERE key='admin_password'");
    const currentPassword = row ? row.value : "123456";
    
    if (password === currentPassword) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Mật khẩu không chính xác!" });
    }
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
      <div class="meta-line"><span>Thu ngân</span><b>${escapeHtml(cashier || "ADMIN")}</b></div>
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
      const sent = dispatchReceiptToType("TAMTINH", {
        title: "TẠM TÍNH",
        tableNum: table_num,
        timeLabel: "Giờ",
        timeValue: new Date().toLocaleString("vi-VN"),
        items,
        totalLabel: "TẠM TÍNH",
        totalValue: total,
        billNo: "--",
        cashier: "ADMIN",
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
      const sent = dispatchReceiptToType("BILL", {
        title: "TIEM NUONG DA LAT VA EM",
        subtitle: "24 duong 3 thang 4, Da Lat - Hotline 081 366 5665",
        tableNum: table_num,
        timeLabel: "Ngày",
        timeValue: new Date().toLocaleString("vi-VN"),
        items,
        totalLabel: "THÀNH TIỀN",
        totalValue: total,
        billNo: "--",
        cashier: "ADMIN",
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
      const sent = dispatchReceiptToType("BILL", {
        title: "TIEM NUONG DA LAT VA EM",
        subtitle: "24 duong 3 thang 4, Da Lat - Hotline 081 366 5665",
        tableNum: bill.table_num,
        timeLabel: "Ngày",
        timeValue: new Date(bill.created_at).toLocaleString("vi-VN"),
        items,
        totalLabel: "THÀNH TIỀN",
        totalValue: bill.total,
        billNo: bill.id,
        cashier: "ADMIN",
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
    console.log(`🖨️  Máy in POS: tcp://${getPrinterIP()}`);
    console.log("   → Đổi IP máy in qua giao diện Settings trong app");
  });
}

// Khởi động
initDb().catch(err => {
  console.error("❌ Không thể khởi tạo DB:", err);
  process.exit(1);
});