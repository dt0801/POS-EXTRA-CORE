const FALLBACK_API_URL = "https://pos-extra-core.onrender.com";

export const API_URL = (process.env.REACT_APP_API_URL || FALLBACK_API_URL).replace(/\/+$/, "");

export function buildApiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}
