const FALLBACK_API_URL = "https://pos-extra-core.onrender.com";

function isLocalhostApiUrl(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(String(url || "").trim());
}

const envApiUrl = (process.env.REACT_APP_API_URL || "").trim();

/**
 * Khi UI mở từ máy quầy (localhost / 127.0.0.1), luôn gọi API cùng origin (Express hoặc qua proxy CRA).
 * Nếu không làm vậy, bundle production mặc định trỏ tới cloud (Linux) → GET /printers luôn rỗng vì không có Get-Printer.
 */
function resolveBrowserLocalApiBase() {
  if (typeof window === "undefined") return null;
  const h = window.location.hostname;
  if (h !== "localhost" && h !== "127.0.0.1") return null;
  try {
    return window.location.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

const browserLocalBase = resolveBrowserLocalApiBase();

// Tránh bundle production (Vercel) dùng nhầm REACT_APP_API_URL=http://127.0.0.1:... lúc build — dev local vẫn dùng được localhost vì NODE_ENV=development.
const effectiveApiUrl = browserLocalBase
  ? browserLocalBase
  : process.env.NODE_ENV === "production" && envApiUrl && isLocalhostApiUrl(envApiUrl)
    ? FALLBACK_API_URL
    : envApiUrl || FALLBACK_API_URL;

export const API_URL = effectiveApiUrl.replace(/\/+$/, "");

/** Chỉ khi UI mở từ máy quầy (localhost) thì /printers mới có thể trả máy in Windows. */
export function isLocalQuayOrigin() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

export function buildApiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}