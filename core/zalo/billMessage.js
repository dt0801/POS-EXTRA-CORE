const { formatEuropeDateTime } = require("../time/europeTime");

function formatMoney(cents) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    (Number(cents) || 0) / 100
  );
}

function paymentLabel(method) {
  return String(method || "").toUpperCase() === "CARD" ? "The / Card" : "Tien mat";
}

function formatQty(qty) {
  const value = Number(qty || 0);
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function formatMessageTime(date = new Date()) {
  return formatEuropeDateTime(date, "vi-VN").replace(/:\d{2}(?=\s|$)/, "");
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

  const normalizedItems = Array.isArray(items) ? items : [];
  const totalDiscount = Number(discountAmount || 0) + Number(billDiscountAmount || 0);
  const separator = "━━━━━━━━━━━━━━";
  const lines = [];

  lines.push(`🧾 HUMAMI BILL #${billId || "-"}`);
  lines.push(separator);
  lines.push(`🪑 Ban: ${tableNum || "-"}`);
  lines.push(`🕒 Gio: ${formatMessageTime(new Date())}`);
  if (cashierName) lines.push(`👤 Nhan vien: ${cashierName}`);
  lines.push(`${String(paymentMethod || "").toUpperCase() === "CARD" ? "💳" : "💵"} Thanh toan: ${paymentLabel(paymentMethod)}`);
  lines.push(separator);
  lines.push("🍽️ Mon da ban");

  normalizedItems.forEach((item, index) => {
    const qty = Number(item.qty || 0);
    const name = String(item.name || "").trim() || "Mon";
    const lineTotal = Number(item.price || 0) * qty;
    const itemDiscount = Number(item.discount_percent || 0);
    lines.push(`${index + 1}. ${name}`);
    lines.push(`   ${formatQty(qty)} x ${formatMoney(item.price)} = ${formatMoney(lineTotal)}${itemDiscount > 0 ? ` (-${itemDiscount}%)` : ""}`);
  });

  lines.push(separator);
  if (subtotal != null && Number(subtotal) !== Number(total)) {
    lines.push(`📌 Tam tinh: ${formatMoney(subtotal)}`);
  }
  if (totalDiscount > 0) lines.push(`🏷️ Giam gia: -${formatMoney(totalDiscount)}`);
  lines.push(`✅ Tong cong: ${formatMoney(total)}`);
  if (cashGiven > 0) lines.push(`💶 Khach dua: ${formatMoney(cashGiven)}`);
  if (changeDue > 0) lines.push(`↩️ Tra lai: ${formatMoney(changeDue)}`);
  lines.push(separator);
  lines.push("Cam on quy khach!");

  return lines.join("\n");
}

module.exports = { buildZaloBillMessage };
