function getPrinterIP(settingsCache) {
  const v = settingsCache.printer_ip;
  return v && String(v).trim() ? String(v).trim() : "";
}

module.exports = { getPrinterIP };
