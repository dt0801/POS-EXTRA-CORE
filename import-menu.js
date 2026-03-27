/**
 * import-menu.js – Import toàn bộ menu BBQ Đà Lạt vào pos.db
 * Chạy: node import-menu.js --reset
 */

const sqlite3 = require("sqlite3").verbose();
const { menuSeedItems: items } = require("./server/seed/menuSeed");
const db = new sqlite3.Database("pos.db");

// =============================================
// IMPORT VÀO DATABASE
// =============================================
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS menu (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT,
      price INTEGER,
      type  TEXT,
      image TEXT
    )
  `);

  if (process.argv.includes("--reset")) {
    db.run("DELETE FROM menu");
    console.log("🗑️  Đã xóa menu cũ\n");
  }

  const stmt = db.prepare(
    "INSERT INTO menu (name, price, type, image) VALUES (?, ?, ?, ?)"
  );

  let count = 0;
  items.forEach(item => {
    stmt.run(item.name, item.price, item.type, "", (err) => {
      if (err) console.error(`  ❌ ${item.name}:`, err.message);
      else {
        count++;
        console.log(`  ✅ [${item.type}] ${item.name} – ${item.price}k`);
      }
    });
  });

  stmt.finalize(() => {
    db.get("SELECT COUNT(*) AS total FROM menu", (err, row) => {
      console.log(`\n🎉 Import xong! Tổng: ${row.total} món`);
      const combos = items.filter(i => i.type === "COMBO").length;
      const foods  = items.filter(i => i.type === "FOOD").length;
      const drinks = items.filter(i => i.type === "DRINK").length;
      console.log(`   📦 Combo: ${combos} | 🍖 Món: ${foods} | 🍺 Đồ uống: ${drinks}`);
      db.close();
    });
  });
});