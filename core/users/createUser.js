/**
 * @param {{
 *   mongoDb: import("mongodb").Db,
 *   getNextMongoId: (name: string) => Promise<number>,
 *   bcrypt: typeof import("bcryptjs"),
 * }} deps
 */
async function createUser(deps, body) {
  const { mongoDb, getNextMongoId, bcrypt } = deps;
  try {
    const { username, password, role, full_name } = body || {};
    if (!username || !password) {
      return { status: 400, body: { error: "Thiếu username/password" } };
    }
    const safeRole = String(role || "staff").toLowerCase();
    if (!["admin", "staff"].includes(safeRole)) {
      return { status: 400, body: { error: "Role không hợp lệ" } };
    }
    const exist = await mongoDb.collection("users").findOne({ username: String(username).trim() });
    if (exist) return { status: 409, body: { error: "Username đã tồn tại" } };
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
    return { status: 200, body: { created: true, id: nextId } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { createUser };
