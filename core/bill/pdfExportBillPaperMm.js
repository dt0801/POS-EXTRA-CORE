/** Khớp BillPreview: máy in BILL/ALL bật đầu tiên; ?paper=58|80 ép khổ. */
function pdfExportBillPaperMm(printers, queryPaper) {
  const q = Number(queryPaper);
  if (q === 58) return 58;
  if (q === 80) return 80;
  const list = (printers || []).filter(
    (p) =>
      Number(p.is_enabled) !== 0 &&
      (String(p.type || "").toUpperCase() === "BILL" || String(p.type || "").toUpperCase() === "ALL")
  );
  const ps = Number(list[0]?.paper_size);
  return ps === 58 ? 58 : 80;
}

module.exports = { pdfExportBillPaperMm };
