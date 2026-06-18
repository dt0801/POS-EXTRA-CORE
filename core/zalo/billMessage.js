const { formatEuropeDateTime } = require("../time/europeTime");

function formatMoney(cents) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    (Number(cents) || 0) / 100
  );
}

function paymentLabel(method) {
  return String(method || "").toUpperCase() === "CARD" ? "The" : "Tien mat";
}

function buildZaloBillMessage(input = {}) {
  const {
    billId,
    tableNum,
    items = [],
    total,
    subtotal,
    discountAmount,
    billDiscountAmount,
    cashGiven,
    changeDue,
    paymentMethod,
    cashierName,
  } = input;

  const lines = [
    `BILL #${billId || "-"}`,
    `Ban: ${tableNum || "-"}`,
    `Thoi gian: ${formatEuropeDateTime(new Date(), "vi-VN")}`,
    cashierName ? `Nhan vien: ${cashierName}` : "",
    `Thanh toan: ${paymentLabel(paymentMethod)}`,
    "",
    "Mon:",
  ].filter(Boolean);

  (Array.isArray(items) ? items : []).forEach((item) => {
    const qty = Number(item.qty || 0);
    const name = String(item.name || "").trim() || "Mon";
    const lineTotal = Number(item.price || 0) * qty;
    lines.push(`- ${name} x${qty}: ${formatMoney(lineTotal)}`);
  });

  lines.push("");
  if (subtotal != null && Number(subtotal) !== Number(total)) {
    lines.push(`Tam tinh: ${formatMoney(subtotal)}`);
  }
  const totalDiscount = Number(discountAmount || 0) + Number(billDiscountAmount || 0);
  if (totalDiscount > 0) lines.push(`Giam gia: -${formatMoney(totalDiscount)}`);
  lines.push(`Tong cong: ${formatMoney(total)}`);
  if (cashGiven > 0) lines.push(`Khach dua: ${formatMoney(cashGiven)}`);
  if (changeDue > 0) lines.push(`Tra lai: ${formatMoney(changeDue)}`);

  return lines.join("\n");
}

module.exports = { buildZaloBillMessage };
