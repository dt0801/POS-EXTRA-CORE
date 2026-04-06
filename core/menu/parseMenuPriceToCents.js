/** Giá menu lưu cent. Form có thể gửi "2690" (cent) hoặc "26,90" / "26.90" (euro). */
function parseMenuPriceToCents(v) {
  if (v == null || v === "") return 0;
  const s = String(v).trim().replace(/\s/g, "");
  if (!s) return 0;
  if (/[.,]/.test(s)) {
    const n = parseFloat(s.replace(",", "."));
    return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

module.exports = parseMenuPriceToCents;
