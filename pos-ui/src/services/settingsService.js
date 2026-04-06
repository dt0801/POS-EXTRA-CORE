import { buildApiUrl } from "../config/api";
import { getAuthToken } from "./authService";
import { get, post } from "./apiClient";

export function fetchSettings() {
  return get("/settings");
}

export function saveSetting(key, value) {
  return post("/settings", { key, value });
}

export function saveAllSettings(settings) {
  return Promise.all(Object.entries(settings).map(([key, value]) => saveSetting(key, value)));
}

export async function uploadStoreLogo(file) {
  const token = getAuthToken();
  if (!token) throw new Error("Chưa đăng nhập");
  const fd = new FormData();
  fd.append("logo", file);
  const res = await fetch(buildApiUrl("/settings/logo"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload logo thất bại");
  return data;
}
