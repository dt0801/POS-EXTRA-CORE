import { buildApiUrl } from "../config/api";

const TOKEN_KEY = "pos_auth_token";
const USER_KEY = "pos_auth_user";

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function getAuthUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAuthSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token || "");
  localStorage.setItem(USER_KEY, JSON.stringify(user || null));
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function login(username, password) {
  const res = await fetch(buildApiUrl("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Đăng nhập thất bại");
  if (!data?.token || !data?.user) throw new Error("Server trả dữ liệu đăng nhập không hợp lệ");
  setAuthSession(data.token, data.user);
  return data;
}

export async function fetchMe(token = getAuthToken()) {
  if (!token) throw new Error("Thiếu token");
  const res = await fetch(buildApiUrl("/auth/me"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Phiên đăng nhập không hợp lệ");
  return data;
}

export async function logout(token = getAuthToken()) {
  if (!token) {
    clearAuthSession();
    return;
  }
  try {
    await fetch(buildApiUrl("/auth/logout"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } finally {
    clearAuthSession();
  }
}
