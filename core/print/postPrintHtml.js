function postPrintHtml({ printersCache, type, html }) {
  if (typeof global.printHtmlToDevice !== "function") {
    return { status: 503, body: { error: "Không hỗ trợ in ngầm ngoài môi trường Electron" } };
  }

  const printers = printersCache.filter(
    (p) => Number(p.is_enabled) === 1 && (p.type === type || p.type === "ALL")
  );
  if (printers.length === 0) {
    return { status: 404, body: { error: `Chưa có cấu hình máy in cho ${type}` } };
  }

  for (const p of printers) {
    console.log(`🖨️  Gửi bản in HTML ngầm tới máy in: ${p.name}`);
    global.printHtmlToDevice(html, p.name, { paperSize: p.paper_size || 80 });
  }
  return { status: 200, body: { success: true } };
}

module.exports = { postPrintHtml };
