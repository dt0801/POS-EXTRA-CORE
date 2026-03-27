const FALLBACK_API_URL = "https://pos-extra-core.onrender.com";
const envApiUrl = (process.env.REACT_APP_API_URL || "").trim();

export const API_URL = (envApiUrl || FALLBACK_API_URL).replace(/\/+$/, "");

export function buildApiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}