const { buildZaloBillMessage } = require("./billMessage");

const ZALO_BOT_BASE_URL = "https://bot-api.zapps.me";

function settingOrEnv(settings, settingKey, envKey, fallback = "") {
  const settingValue = settings && settings[settingKey] != null ? String(settings[settingKey]).trim() : "";
  if (settingValue) return settingValue;
  return String(process.env[envKey] || fallback).trim();
}

function getZaloConfig(settings = {}, overrides = {}) {
  const source = { ...(settings || {}), ...(overrides || {}) };
  const botToken = settingOrEnv(source, "zalo_bot_token", "ZALO_BOT_TOKEN");
  const botChatId = settingOrEnv(source, "zalo_bot_chat_id", "ZALO_BOT_CHAT_ID");
  const botBaseUrl = settingOrEnv(source, "zalo_bot_base_url", "ZALO_BOT_BASE_URL", ZALO_BOT_BASE_URL);

  return {
    enabled: Boolean(botToken && botChatId),
    mode: "bot",
    botToken,
    botChatId,
    botBaseUrl: botBaseUrl.replace(/\/+$/, ""),
  };
}

async function callZaloBot(config, endpoint, data = {}) {
  const response = await fetch(`${config.botBaseUrl}/bot${config.botToken}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!response.ok || payload?.ok === false) {
    const message = payload?.description || payload?.error || payload?.message || text || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload?.result ?? payload;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function splitMessage(text, maxLength = 1800) {
  const value = String(text || "");
  if (value.length <= maxLength) return [value];
  const chunks = [];
  let rest = value;
  while (rest.length > maxLength) {
    const cutAt = Math.max(rest.lastIndexOf("\n", maxLength), rest.lastIndexOf(" ", maxLength), maxLength);
    chunks.push(rest.slice(0, cutAt).trim());
    rest = rest.slice(cutAt).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function listZaloThreads(settings = {}, overrides = {}) {
  const config = getZaloConfig(settings, overrides);
  const missing = [];
  if (!config.botToken) missing.push("ZALO_BOT_TOKEN");
  if (missing.length) {
    return { ok: false, error: `Zalo Bot chua duoc cau hinh: thieu ${missing.join(", ")}`, missing };
  }

  const updates = await callZaloBot(config, "getUpdates", { limit: 50, timeout: 0 });
  const rows = toArray(updates)
    .map((update) => update?.message?.chat || update?.chat)
    .filter(Boolean)
    .map((chat) => ({
      id: String(chat.id || chat.chat_id || "").trim(),
      name: String(chat.title || chat.display_name || chat.name || chat.id || "").trim(),
      type: String(chat.type || "user").toLowerCase().includes("group") ? "group" : "user",
    }))
    .filter((item) => item.id);
  const seen = new Set();
  const uniqueRows = rows.filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    ok: true,
    friends: uniqueRows.filter((item) => item.type !== "group"),
    groups: uniqueRows.filter((item) => item.type === "group"),
  };
}

async function sendBillToZalo(input = {}, settings = {}, overrides = {}) {
  const config = getZaloConfig(settings, overrides);
  if (!config.enabled) {
    const missing = [];
    if (!config.botToken) missing.push("ZALO_BOT_TOKEN");
    if (!config.botChatId) missing.push("ZALO_BOT_CHAT_ID");
    return {
      ok: true,
      skipped: true,
      reason: `Zalo chua duoc cau hinh: thieu ${missing.join(", ")}`,
      missing,
    };
  }

  const message = buildZaloBillMessage(input);
  const results = [];
  for (const text of splitMessage(message)) {
    results.push(await callZaloBot(config, "sendMessage", {
      chat_id: config.botChatId,
      text,
    }));
  }
  return { ok: true, skipped: false, mode: "bot", result: results.length === 1 ? results[0] : results };
}

module.exports = { sendBillToZalo, getZaloConfig, listZaloThreads };
