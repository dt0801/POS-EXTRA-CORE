async function ensureAuthBootstrap({ mongoDb, bcrypt, getNextMongoId }) {
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

module.exports = { ensureAuthBootstrap };
