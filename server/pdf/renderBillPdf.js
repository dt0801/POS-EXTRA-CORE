/**
 * Vẽ nội dung hóa đơn lên PDFDocument (đồng bộ).
 * Giá trị tiền: cent → EUR (cùng quy ước DB/UI).
 */

function fmtEuroCents(cents) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    (Number(cents) || 0) / 100
  );
}

/**
 * @param {InstanceType<import("pdfkit")>} doc
 * @param {{
 *   storeName: string,
 *   billId: number,
 *   tableNum: number,
 *   createdAt: string,
 *   items: { name: string, price: number, qty: number }[],
 *   total: number,
 * }} data
 */
function renderBillPdf(doc, data) {
  const { storeName, billId, tableNum, createdAt, items, total } = data;
  const title = storeName || "Hóa đơn";

  doc.fontSize(18).text(title, { align: "center" });
  doc.moveDown(0.4);
  doc.fontSize(11).text("HÓA ĐƠN THANH TOÁN", { align: "center" });
  doc.moveDown(0.8);

  doc.fontSize(10);
  doc.text(`Số HĐ: ${billId}          Bàn: ${tableNum}`);
  const dateStr = createdAt ? new Date(createdAt).toLocaleString("vi-VN") : "—";
  doc.text(`Thời gian: ${dateStr}`);
  doc.moveDown(0.6);

  doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).stroke("#bbbbbb");
  doc.moveDown(0.5);

  (items || []).forEach((it, idx) => {
    if (doc.y > doc.page.height - 100) {
      doc.addPage();
    }
    const qty = Number(it.qty) || 0;
    const price = Number(it.price) || 0;
    const lineTotal = price * qty;
    const name = String(it.name || "");

    doc.fontSize(10).fillColor("#000");
    doc.text(`${idx + 1}. ${name}`);
    doc.fontSize(9).fillColor("#444");
    doc.text(
      `     SL ${qty}  ·  Đơn giá ${fmtEuroCents(price)}  ·  Thành tiền dòng ${fmtEuroCents(lineTotal)}`
    );
    doc.fillColor("#000");
    doc.moveDown(0.25);
  });

  doc.moveDown(0.4);
  doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).stroke("#bbbbbb");
  doc.moveDown(0.5);

  doc.fontSize(12).fillColor("#000").text(`THÀNH TIỀN: ${fmtEuroCents(total)}`, { align: "right" });
  doc.moveDown(0.8);
  doc.fontSize(9).fillColor("#555").text("Cảm ơn quý khách.", { align: "center" });
  doc.fillColor("#000");
}

module.exports = { renderBillPdf, fmtEuroCents };
