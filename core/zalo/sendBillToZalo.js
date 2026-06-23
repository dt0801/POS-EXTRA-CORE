const { buildZaloBillMessage } = require("./billMessage");

let apiPromise = null;
let apiConfigKey = "";
const ZALO_BOT_BASE_URL = "https://bot-api.zapps.me";

function parseCookie(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

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
  const cookieRaw = settingOrEnv(source, "zalo_cookie_json", "ZALO_COOKIE_JSON");
  const cookie = parseCookie(cookieRaw);
  const imei = settingOrEnv(source, "zalo_imei", "ZALO_IMEI");
  const userAgent = settingOrEnv(source, "zalo_user_agent", "ZALO_USER_AGENT");
  const threadId = settingOrEnv(source, "zalo_thread_id", "ZALO_THREAD_ID");
  const threadType = settingOrEnv(source, "zalo_thread_type", "ZALO_THREAD_TYPE", "user").toLowerCase();
  const botEnabled = Boolean(botToken && botChatId);
  const cookieEnabled = Boolean(cookie && imei && userAgent && threadId);

  return {
    enabled: botEnabled || cookieEnabled,
    mode: botToken ? "bot" : "cookie",
    botToken,
    botChatId,
    botBaseUrl: botBaseUrl.replace(/\/+$/, ""),
    botEnabled,
    cookieEnabled,
    cookie,
    imei,
    userAgent,
    threadId,
    threadType,
    configKey: JSON.stringify({ cookieRaw, imei, userAgent, threadId, threadType }),
  };
}

function getMissingLoginFields(config) {
  const missing = [];
  if (!config.cookie) missing.push("ZALO_COOKIE_JSON");
  if (!config.imei) missing.push("ZALO_IMEI");
  if (!config.userAgent) missing.push("ZALO_USER_AGENT");
  return missing;
}

async function getZaloApi(config) {
  if (apiConfigKey !== config.configKey) {
    apiPromise = null;
    apiConfigKey = config.configKey;
  }
  if (!apiPromise) {
    apiPromise = (async () => {
      const { Zalo } = await import("zalo-api-final");
      const zalo = new Zalo({
        selfListen: false,
        checkUpdate: false,
        logging: false,
      });
      return zalo.login({
        cookie: config.cookie,
        imei: config.imei,
        userAgent: config.userAgent,
      });
    })().catch((error) => {
      apiPromise = null;
      throw error;
    });
  }
  return apiPromise;
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

function getThreadName(item) {
  return String(
    item?.displayName ||
    item?.name ||
    item?.zaloName ||
    item?.userName ||
    item?.groupName ||
    item?.title ||
    ""
  ).trim();
}

function getThreadId(item) {
  return String(
    item?.userId ||
    item?.uid ||
    item?.id ||
    item?.groupId ||
    item?.grid ||
    item?.threadId ||
    ""
  ).trim();
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
  if (config.botToken) {
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

  const missing = getMissingLoginFields(config);
  if (missing.length) {
    return { ok: false, error: `Zalo chua du cau hinh dang nhap: thieu ${missing.join(", ")}`, missing };
  }

  const api = await getZaloApi(config);
  const [friendsRaw, groupsRaw] = await Promise.all([
    typeof api.getAllFriends === "function" ? api.getAllFriends() : [],
    typeof api.getAllGroups === "function" ? api.getAllGroups() : [],
  ]);

  const friends = toArray(friendsRaw)
    .map((item) => ({ id: getThreadId(item), name: getThreadName(item), type: "user" }))
    .filter((item) => item.id);
  const groups = toArray(groupsRaw)
    .map((item) => ({ id: getThreadId(item), name: getThreadName(item), type: "group" }))
    .filter((item) => item.id);

  return { ok: true, friends, groups };
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
  if (config.botEnabled) {
    const results = [];
    for (const text of splitMessage(message)) {
      results.push(await callZaloBot(config, "sendMessage", {
        chat_id: config.botChatId,
        text,
      }));
    }
    return { ok: true, skipped: false, mode: "bot", result: results.length === 1 ? results[0] : results };
  }

  const api = await getZaloApi(config);
  const { ThreadType } = await import("zalo-api-final");
  const type = config.threadType === "group" ? ThreadType.Group : ThreadType.User;
  const result = await api.sendMessage(message, config.threadId, type);
  return { ok: true, skipped: false, mode: "cookie", result };
}

module.exports = { sendBillToZalo, getZaloConfig, listZaloThreads };
