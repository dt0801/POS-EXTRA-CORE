const { buildZaloBillMessage } = require("./billMessage");

let apiPromise = null;

function parseCookie(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getZaloConfig() {
  const cookie = parseCookie(process.env.ZALO_COOKIE_JSON || "");
  const imei = String(process.env.ZALO_IMEI || "").trim();
  const userAgent = String(process.env.ZALO_USER_AGENT || "").trim();
  const threadId = String(process.env.ZALO_THREAD_ID || "").trim();
  const threadType = String(process.env.ZALO_THREAD_TYPE || "user").trim().toLowerCase();

  return {
    enabled: Boolean(cookie && imei && userAgent && threadId),
    cookie,
    imei,
    userAgent,
    threadId,
    threadType,
  };
}

async function getZaloApi(config) {
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

async function sendBillToZalo(input = {}) {
  const config = getZaloConfig();
  if (!config.enabled) {
    return { ok: true, skipped: true, reason: "Zalo chua duoc cau hinh" };
  }

  const api = await getZaloApi(config);
  const { ThreadType } = await import("zalo-api-final");
  const type = config.threadType === "group" ? ThreadType.Group : ThreadType.User;
  const message = buildZaloBillMessage(input);
  const result = await api.sendMessage(message, config.threadId, type);
  return { ok: true, skipped: false, result };
}

module.exports = { sendBillToZalo, getZaloConfig };
