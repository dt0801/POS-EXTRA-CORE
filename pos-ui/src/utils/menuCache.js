const MENU_CACHE_KEY = "pos_menu_cache_v1";
const MENU_CACHE_MAX_AGE_MS = 3 * 60 * 1000;

/** Đọc menu đã cache (sessionStorage) — dùng để hiển thị tức thì trước khi API trả về. */
export function readMenuCache() {
  try {
    const raw = sessionStorage.getItem(MENU_CACHE_KEY);
    if (!raw) return null;
    const { ts, items } = JSON.parse(raw);
    if (!Array.isArray(items) || !ts) return null;
    if (Date.now() - ts > MENU_CACHE_MAX_AGE_MS) return null;
    return items;
  } catch {
    return null;
  }
}

export function writeMenuCache(items) {
  try {
    sessionStorage.setItem(MENU_CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
  } catch {
    // quota / private mode
  }
}
