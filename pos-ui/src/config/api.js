const FALLBACK_API_URL = "https://pos-extra-core.onrender.com";

const envApiUrl = (process.env.REACT_APP_API_URL || "").trim();
const sameOriginApiUrl = typeof window !== "undefined" ? window.location.origin : "";

// Ưu tiên ENV; nếu không có thì dùng same-origin (khi frontend + server.js deploy chung),
// cuối cùng mới fallback về backend Render.
export const API_URL = "https://pos-extra-core.onrender.com";

export function buildApiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}
