/**
 * Gửi phiếu in tới handler in ngầm (Electron: global.printHtmlToDevice).
 */

function getDefaultPrintHtml() {
  return typeof global.printHtmlToDevice === "function" ? global.printHtmlToDevice : null;
}

function createDispatchReceiptToType(deps) {
  const { getEnabledPrintersByType, buildReceiptHtml, getPrintHtml = getDefaultPrintHtml } = deps;

  function dispatchReceiptToType(type, receiptData) {
    const printHtml = getPrintHtml();
    if (!printHtml) {
      const err = new Error("Không hỗ trợ in ngầm ngoài môi trường Electron");
      err.statusCode = 503;
      throw err;
    }

    const printers = getEnabledPrintersByType(type);
    if (!printers.length) {
      const err = new Error(`Chưa cấu hình máy in cho loại ${type}`);
      err.statusCode = 503;
      throw err;
    }

    printers.forEach((printer) => {
      const html = buildReceiptHtml(receiptData, printer.paper_size || 80);
      console.log(`🖨️  [${type}] In HTML tới máy: ${printer.name}`);
      printHtml(html, printer.name, { paperSize: printer.paper_size || 80 });
    });

    return printers.length;
  }

  return { dispatchReceiptToType };
}

module.exports = { createDispatchReceiptToType, getDefaultPrintHtml };
