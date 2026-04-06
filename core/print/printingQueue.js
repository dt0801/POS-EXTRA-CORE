function getEnabledPrintersByType(printersCache, type) {
  return printersCache.filter(
    (p) => Number(p.is_enabled) === 1 && (p.type === type || p.type === "ALL")
  );
}

function enqueueJobsForType(printersCache, buildReceiptHtml, type, receiptData) {
  const printers = getEnabledPrintersByType(printersCache, type);
  return printers.map((printer) => ({
    printType: type,
    printerName: printer.name,
    paperSize: printer.paper_size || 80,
    html: buildReceiptHtml(receiptData, printer.paper_size || 80),
  }));
}

module.exports = { getEnabledPrintersByType, enqueueJobsForType };
