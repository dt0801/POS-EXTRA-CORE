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
