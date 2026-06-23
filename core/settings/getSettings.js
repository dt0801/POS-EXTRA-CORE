const SECRET_SETTING_KEYS = [
  "zalo_bot_token",
  "zalo_cookie_json",
  "zalo_imei",
  "zalo_user_agent",
];

function getSettings(settingsCache, options = {}) {
  if (!options.redactSecrets) return { status: 200, body: settingsCache };

  const redacted = { ...settingsCache };
  for (const key of SECRET_SETTING_KEYS) {
    if (redacted[key]) redacted[key] = "";
  }
  return { status: 200, body: redacted };
}

module.exports = { getSettings };
