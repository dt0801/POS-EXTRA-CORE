/**
 * @param {{
 *   mongoDb: import("mongodb").Db,
 *   bcrypt: typeof import("bcryptjs"),
 *   notifyForceLogout: (userId: string | number, reason?: string) => void,
 * }} deps
 * @param {{ id: number, body: object }} input
 */
async function updateUser(deps, input) {
  const { mongoDb, bcrypt, notifyForceLogout } = deps;
  const id = Number(input.id);
  const { full_name, role, is_active, password } = input.body || {};
  try {
    const patch = { updated_at: new Date().toISOString() };
    if (full_name !== undefined) patch.full_name = String(full_name || "").trim();
    if (role !== undefined) {
      const safeRole = String(role).toLowerCase();
      if (!["admin", "staff"].includes(safeRole)) {
        return { status: 400, body: { error: "Role không hợp lệ" } };
      }
      patch.role = safeRole;
    }
    if (is_active !== undefined) patch.is_active = is_active ? 1 : 0;
    if (password) patch.password_hash = await bcrypt.hash(String(password), 10);

    const before = await mongoDb.collection("users").findOne({ sqlite_id: id });
    if (!before) return { status: 404, body: { error: "Không tìm thấy user" } };
    const roleChanged = patch.role && patch.role !== before.role;
    const disabled = patch.is_active === 0 && Number(before.is_active) !== 0;
    const resetSession = Boolean(password) || roleChanged || disabled;
    if (resetSession) {
      patch.session_version = Number(before.session_version || 0) + 1;
      patch.active_session_id = "";
    }
    await mongoDb.collection("users").updateOne({ sqlite_id: id }, { $set: patch });
    if (resetSession) notifyForceLogout(id, "Tài khoản của bạn vừa được cập nhật bởi admin");
    return { status: 200, body: { updated: true } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { updateUser };
