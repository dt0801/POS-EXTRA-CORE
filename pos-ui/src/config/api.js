const FALLBACK_API_URL = "https://pos-extra-core.onrender.com";

function isLocalhostApiUrl(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(String(url || "").trim());
}

const envApiUrl = (process.env.REACT_APP_API_URL || "").trim();
// Tránh bundle production (Vercel) dùng nhầm REACT_APP_API_URL=http://127.0.0.1:... lúc build — dev local vẫn dùng được localhost vì NODE_ENV=development.
const effectiveApiUrl =
  process.env.NODE_ENV === "production" && envApiUrl && isLocalhostApiUrl(envApiUrl)
    ? FALLBACK_API_URL
    : envApiUrl || FALLBACK_API_URL;

export const API_URL = effectiveApiUrl.replace(/\/+$/, "");

export function buildApiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}