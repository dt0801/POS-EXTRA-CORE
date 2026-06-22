const { buildZaloBillMessage } = require("./billMessage");

let apiPromise = null;
let apiConfigKey = "";

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

function getZaloConfig(settings = {}) {
  const cookieRaw = settingOrEnv(settings, "zalo_cookie_json", "ZALO_COOKIE_JSON");
  const cookie = parseCookie(cookieRaw);
  const imei = settingOrEnv(settings, "zalo_imei", "ZALO_IMEI");
  const userAgent = settingOrEnv(settings, "zalo_user_agent", "ZALO_USER_AGENT");
  const threadId = settingOrEnv(settings, "zalo_thread_id", "ZALO_THREAD_ID");
  const threadType = settingOrEnv(settings, "zalo_thread_type", "ZALO_THREAD_TYPE", "user").toLowerCase();

  return {
    enabled: Boolean(cookie && imei && userAgent && threadId),
    cookie,
    imei,
    userAgent,
    threadId,
    threadType,
    configKey: JSON.stringify({ cookieRaw, imei, userAgent, threadId, threadType }),
  };
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

async function sendBillToZalo(input = {}, settings = {}) {
  const config = getZaloConfig(settings);
  if (!config.enabled) {
    const missing = [];
    if (!config.cookie) missing.push("ZALO_COOKIE_JSON");
    if (!config.imei) missing.push("ZALO_IMEI");
    if (!config.userAgent) missing.push("ZALO_USER_AGENT");
    if (!config.threadId) missing.push("ZALO_THREAD_ID");
    return {
      ok: true,
      skipped: true,
      reason: `Zalo chua duoc cau hinh: thieu ${missing.join(", ")}`,
      missing,
    };
  }

  const api = await getZaloApi(config);
  const { ThreadType } = await import("zalo-api-final");
  const type = config.threadType === "group" ? ThreadType.Group : ThreadType.User;
  const message = buildZaloBillMessage(input);
  const result = await api.sendMessage(message, config.threadId, type);
  return { ok: true, skipped: false, result };
}

module.exports = { sendBillToZalo, getZaloConfig };
