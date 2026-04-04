/**
 * Giá menu trong DB/API: cent (2690 = 26,90 €).
 * Form nhập theo euro, có thể dùng dấu phẩy (DE/VN).
 */

/** Hiển thị trong ô nhập: "26,90" */
export function centsToEuroInputString(cents) {
  const c = Math.round(Number(cents) || 0);
  return (c / 100).toFixed(2).replace(".", ",");
}

/**
 * @param {string} raw
 * @returns {number|null} cent hoặc null nếu rỗng / không hợp lệ
 */
export function parseEuroInputToCents(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s/g, "");
  if (s === "") return null;
  const normalized = s.replace(",", ".");
  const n = parseFloat(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
