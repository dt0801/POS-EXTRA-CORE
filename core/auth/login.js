/**
 * @param {{
 *   mongoDb: import("mongodb").Db,
 *   bcrypt: typeof import("bcryptjs"),
 *   jwt: typeof import("jsonwebtoken"),
 *   jwtSecret: string,
 *   makeSessionId: () => string,
 *   notifyForceLogout: (userId: string | number, reason?: string) => void,
 * }} deps
 * @param {object} body - req.body
 * @returns {Promise<{ status: number, body: object }>}
 */
async function authLogin(deps, body) {
  const { mongoDb, bcrypt, jwt, jwtSecret, makeSessionId, notifyForceLogout } = deps;
  try {
    const { username, password } = body || {};
    if (!username || !password) return { status: 400, body: { error: "Thiếu username/password" } };
    const user = await mongoDb.collection("users").findOne({
      username: String(username).trim(),
      is_active: { $ne: 0 },
    });
    if (!user) return { status: 401, body: { error: "Tài khoản không tồn tại hoặc đã bị khóa" } };
    const ok = await bcrypt.compare(String(password), String(user.password_hash || ""));
    if (!ok) return { status: 401, body: { error: "Mật khẩu không đúng" } };

    const previousSessionId = String(user.active_session_id || "");
    const sessionVersion = Number(user.session_version || 0) + 1;
    const sessionId = makeSessionId();
    await mongoDb.collection("users").updateOne(
      { sqlite_id: Number(user.sqlite_id) },
      {
        $set: {
          session_version: sessionVersion,
          active_session_id: sessionId,
          updated_at: new Date().toISOString(),
        },
      }
    );
    if (previousSessionId) {
      notifyForceLogout(user.sqlite_id, "Tài khoản đã đăng nhập trên thiết bị khác");
    }
    const token = jwt.sign(
      {
        id: Number(user.sqlite_id),
        username: user.username,
        role: user.role || "staff",
        full_name: user.full_name || user.username,
        session_id: sessionId,
        session_version: sessionVersion,
      },
      jwtSecret,
      { expiresIn: "12h" }
    );
    return {
      status: 200,
      body: {
        token,
        user: {
          id: Number(user.sqlite_id),
          username: user.username,
          role: user.role || "staff",
          full_name: user.full_name || user.username,
        },
      },
    };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { authLogin };
