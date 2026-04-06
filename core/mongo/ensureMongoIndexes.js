async function ensureMongoIndexes({ mongoDb, mongoReady }) {
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

module.exports = { ensureMongoIndexes };
