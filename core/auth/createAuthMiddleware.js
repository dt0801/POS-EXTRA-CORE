/** mongoDbGetter: Db hiện tại sau khi Mongo connect. */
function createAuthMiddleware({ mongoDbGetter, jwt, jwtSecret }) {
  return async function authMiddleware(req, res, next) {
    try {
      const mongoDb = mongoDbGetter();
      const auth = String(req.headers.authorization || "");
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!token) return res.status(401).json({ error: "Chưa đăng nhập" });
      const decoded = jwt.verify(token, jwtSecret);
      const user = await mongoDb.collection("users").findOne({
        sqlite_id: Number(decoded.id),
        is_active: { $ne: 0 },
      });
      if (!user) return res.status(401).json({ error: "Tài khoản không tồn tại hoặc đã bị khóa" });
      const tokenSid = String(decoded.session_id || "");
      const tokenSv = Number(decoded.session_version || 0);
      const activeSid = String(user.active_session_id || "");
      const activeSv = Number(user.session_version || 0);
      if (!tokenSid || tokenSid !== activeSid || tokenSv !== activeSv) {
        return res.status(401).json({ error: "Phiên đăng nhập đã hết hiệu lực" });
      }
      req.user = {
        id: Number(user.sqlite_id || 0),
        username: user.username,
        role: user.role || "staff",
        full_name: user.full_name || user.username,
        session_id: tokenSid,
        session_version: tokenSv,
        raw: user,
      };
      next();
    } catch {
      return res.status(401).json({ error: "Token không hợp lệ hoặc đã hết hạn" });
    }
  };
}

module.exports = { createAuthMiddleware };
