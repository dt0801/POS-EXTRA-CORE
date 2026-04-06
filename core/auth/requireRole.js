function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Không có quyền thực hiện thao tác này" });
    }
    next();
  };
}

module.exports = { requireRole };
