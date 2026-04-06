/** Cache JSON GET /menu — cùng hành vi như server.js trước refactor. */
let menuListCache = null;
let menuListCacheAt = 0;

function peekMenuListCache(ttlMs, now = Date.now()) {
  if (menuListCache != null && now - menuListCacheAt < ttlMs) {
    return menuListCache;
  }
  return null;
}

function setMenuListCache(payload, now = Date.now()) {
  menuListCache = payload;
  menuListCacheAt = now;
}

function invalidateMenuListCache() {
  menuListCache = null;
  menuListCacheAt = 0;
}

module.exports = {
  peekMenuListCache,
  setMenuListCache,
  invalidateMenuListCache,
};
