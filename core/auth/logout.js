/**
 * @param {{
 *   mongoDb: import("mongodb").Db,
 *   notifyForceLogout: (userId: string | number, reason?: string) => void,
 * }} deps
 * @param {{ id: number, session_version?: number }} user - req.user
 * @returns {Promise<{ status: number, body: object }>}
 */
async function authLogout(deps, user) {
  const { mongoDb, notifyForceLogout } = deps;
  try {
    await mongoDb.collection("users").updateOne(
      { sqlite_id: user.id },
      {
        $set: {
          active_session_id: "",
          session_version: Number(user.session_version || 0) + 1,
          updated_at: new Date().toISOString(),
        },
      }
    );
    notifyForceLogout(user.id, "Bạn đã đăng xuất");
    return { status: 200, body: { success: true } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { authLogout };
