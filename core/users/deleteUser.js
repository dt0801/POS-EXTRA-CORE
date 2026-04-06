/**
 * @param {{
 *   mongoDb: import("mongodb").Db,
 *   notifyForceLogout: (userId: string | number, reason?: string) => void,
 * }} deps
 * @param {{ id: number, actorUserId: number, actorUsername: string }} input
 */
async function deleteUser(deps, input) {
  const { mongoDb, notifyForceLogout } = deps;
  const id = Number(input.id);
  try {
    if (id === Number(input.actorUserId)) {
      return { status: 400, body: { error: "Không thể xóa chính mình" } };
    }
    const user = await mongoDb.collection("users").findOne({ sqlite_id: id });
    if (!user) return { status: 404, body: { error: "Không tìm thấy user" } };
    if (String(user.username) === "admin" && String(input.actorUsername) !== "admin") {
      return { status: 403, body: { error: "Không thể xóa tài khoản admin mặc định" } };
    }
    await mongoDb.collection("users").deleteOne({ sqlite_id: id });
    notifyForceLogout(id, "Tài khoản đã bị xóa");
    return { status: 200, body: { deleted: true } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { deleteUser };
