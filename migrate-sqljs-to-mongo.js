const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");
const { MongoClient } = require("mongodb");

function resolveDbPath() {
  const candidates = [
    path.join(__dirname, "data", "pos.db"),
    path.join(__dirname, "pos.db"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("Khong tim thay file pos.db (data/pos.db hoac pos.db)");
}

function dbAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  const mongoDbName = process.env.MONGODB_DB || "posextra";
  if (!mongoUri) {
    throw new Error("Thieu MONGODB_URI");
  }

  const dbPath = resolveDbPath();
  console.log(`📦 SQLite source: ${dbPath}`);

  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const sqliteDb = new SQL.Database(fileBuffer);

  const exportMap = {
    menu: dbAll(sqliteDb, "SELECT * FROM menu"),
    tables: dbAll(sqliteDb, "SELECT * FROM tables"),
    bills: dbAll(sqliteDb, "SELECT * FROM bills"),
    bill_items: dbAll(sqliteDb, "SELECT * FROM bill_items"),
    settings: dbAll(sqliteDb, "SELECT * FROM settings"),
    windows_printers: dbAll(sqliteDb, "SELECT * FROM windows_printers"),
    order_session: dbAll(sqliteDb, "SELECT * FROM order_session"),
  };

  const client = new MongoClient(mongoUri);
  await client.connect();
  const mdb = client.db(mongoDbName);

  for (const [name, docs] of Object.entries(exportMap)) {
    const col = mdb.collection(name);
    await col.deleteMany({});
    if (docs.length > 0) {
      await col.insertMany(
        docs.map((doc) => ({
          ...doc,
          sqlite_id: doc.id ?? null,
        }))
      );
    }
    console.log(`✅ ${name}: ${docs.length} docs`);
  }

  await client.close();
  sqliteDb.close();
  console.log("🎉 Migration xong.");
}

main().catch((err) => {
  console.error("❌ Migration that bai:", err.message);
  process.exit(1);
});
