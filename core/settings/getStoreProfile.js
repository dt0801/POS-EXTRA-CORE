function getSetting(settingsCache, key, fallback = "") {
  const value = settingsCache[key];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function getBillCssOverride(settingsCache) {
  const v = settingsCache.bill_css_override;
  return v && String(v).trim() ? String(v).trim() : "";
}

function getStoreProfile(settingsCache) {
  const storeName = getSetting(settingsCache, "store_name", "POS STORE");
  const storeAddress = getSetting(settingsCache, "store_address", "");
  const storePhone = getSetting(settingsCache, "store_phone", "");
  const cashierName = getSetting(settingsCache, "cashier_name", "Nhân viên");
  const subtitleParts = [storeAddress, storePhone ? `Hotline ${storePhone}` : ""].filter(Boolean);
  return {
    storeName,
    storeSubtitle: subtitleParts.join(" - "),
    cashierName,
  };
}

module.exports = { getStoreProfile, getSetting, getBillCssOverride };
