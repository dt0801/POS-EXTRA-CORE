import { buildApiUrl } from "../config/api";
import { clearAuthSession, getAuthToken } from "./authService";

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function apiRequest(path, options = {}) {
  const token = getAuthToken();
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const response = await fetch(buildApiUrl(path), { ...options, headers });
  const data = await parseJsonSafe(response);
  if (!response.ok) {
    const error = new Error(data.error || "Yeu cau that bai");
    error.status = response.status;
    error.payload = data;
    if (response.status === 401) clearAuthSession();
    throw error;
  }
  return data;
}

export function get(path) {
  return apiRequest(path);
}

export function post(path, body) {
  return apiRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function put(path, body) {
  return apiRequest(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function del(path) {
  return apiRequest(path, { method: "DELETE" });
}
