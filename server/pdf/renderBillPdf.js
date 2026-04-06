/**
 * PDF hóa đơn khổ phiếu nhiệt (logic khớp billHTML / billHTMLServer).
 * Tiền: cent → EUR (cùng quy ước DB/UI).
 */

const { buildCfg, formatMoney } = require("../printing/billHTMLServer");

function mmToPt(mm) {
  return (Number(mm) || 80) * (72 / 25.4);
}

/**
 * @param {InstanceType<import("pdfkit")>} doc
 * @param {{
 *   billId: number,
 *   tableNum: number,
 *   createdAt: string,
 *   items: { name: string, price: number, qty: number }[],
 *   total: number,
 *   isReprint?: boolean,
 * }} data
 * @param {Record<string, unknown>} settings — settingsCache (bill_*, store_*)
 * @param {number} [paperSizeMm] — 58 | 80
 */
function renderBillPdf(doc, data, settings = {}, paperSizeMm = 80) {
  const cfg = buildCfg(settings || {}, "bill");
  const fs = Math.min(18, Math.max(8, Number(cfg.font_size) || 13));
  const fsSmall = Math.max(8, fs - 1);
  const fsTiny = Math.max(7, fs - 2);
  const pw = Number(paperSizeMm) === 58 ? 58 : 80;
  const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;
  const fmt = (cents) => formatMoney(cents);

  const dateStr = data.createdAt
    ? new Date(data.createdAt).toLocaleString("vi-VN")
    : new Date().toLocaleString("vi-VN");

  const showQty = cfg.show_qty !== "false";
  const showUnitPrice = cfg.show_unit_price !== "false";

  const headerAlign = String(cfg.header_align || "center");
  const alignOpt =
    headerAlign === "left" ? "left" : headerAlign === "right" ? "right" : "center";

  const storeTitle = String(cfg.store_name || "").trim() || "CITRUS POS";

  doc.fontSize(fs + 2).fillColor("#000").text(storeTitle, left, doc.y, {
    width: contentW,
    align: alignOpt,
  });
  doc.moveDown(0.15);

  if (cfg.store_address) {
    doc.fontSize(fsSmall).fillColor("#444").text(String(cfg.store_address), left, doc.y, {
      width: contentW,
      align: alignOpt,
    });
    doc.moveDown(0.1);
  }
  if (cfg.store_phone) {
    doc.fontSize(fsSmall).fillColor("#444").text(`Tel: ${cfg.store_phone}`, left, doc.y, {
      width: contentW,
      align: alignOpt,
    });
    doc.moveDown(0.1);
  }
  if (cfg.extra_header) {
    doc.fontSize(fsSmall).fillColor("#444").text(String(cfg.extra_header), left, doc.y, {
      width: contentW,
      align: alignOpt,
    });
    doc.moveDown(0.1);
  }

  doc.fillColor("#000");
  hr(doc, contentW, left);

  const metaY = doc.y;
  const metaLeft = `Bàn: ${data.tableNum}${data.billId ? ` · HD#${data.billId}` : ""}`;
  doc.fontSize(fsSmall);
  const metaH = Math.max(
    doc.heightOfString(metaLeft, { width: contentW * 0.65 }),
    doc.heightOfString(dateStr, { width: contentW })
  );
  doc.text(metaLeft, left, metaY, { width: contentW * 0.65, align: "left" });
  doc.text(dateStr, left, metaY, { width: contentW, align: "right" });
  doc.y = metaY + metaH + 4;
  doc.moveDown(0.15);

  hr(doc, contentW, left);

  const headY = doc.y;
  const colQty = showQty ? (pw === 58 ? 18 : 22) : 0;
  const colUnit = showUnitPrice ? (pw === 58 ? 40 : 48) : 0;
  const colTT = pw === 58 ? 44 : 52;
  const colName = Math.max(40, contentW - colQty - colUnit - colTT);

  doc.fontSize(fs).fillColor("#000");
  doc.text("Món", left, headY, { width: colName, align: "left" });
  if (showQty) {
    doc.text("SL", left + colName, headY, { width: colQty, align: "center" });
  }
  if (showUnitPrice) {
    doc.text("Đơn", left + colName + colQty, headY, { width: colUnit, align: "right" });
  }
  doc.text("T.Tiền", left + colName + colQty + colUnit, headY, { width: colTT, align: "right" });
  doc.y = headY + fs + 4;
  hr(doc, contentW, left);

  (data.items || []).forEach((it, idx) => {
    ensurePage(doc, 48);
    const qty = Number(it.qty) || 0;
    const price = Number(it.price) || 0;
    const lineTotal = price * qty;
    const name = String(it.name || "");
    const rowTop = doc.y;
    const nameBlock = `${idx + 1}. ${name}`;

    doc.fontSize(fs).fillColor("#000");
    const nameH = doc.heightOfString(nameBlock, { width: colName });
    doc.text(nameBlock, left, rowTop, { width: colName, align: "left" });

    const restY = rowTop;
    if (showQty) {
      doc.text(String(qty), left + colName, restY, { width: colQty, align: "center" });
    }
    if (showUnitPrice) {
      doc.fontSize(fsSmall).fillColor("#555").text(fmt(price), left + colName + colQty, restY, {
        width: colUnit,
        align: "right",
      });
      doc.fillColor("#000");
    }
    doc.fontSize(fs).text(fmt(lineTotal), left + colName + colQty + colUnit, restY, {
      width: colTT,
      align: "right",
    });

    const rowH = Math.max(nameH, fs + 2);
    doc.y = rowTop + rowH + 2;
  });

  hr(doc, contentW, left);
  const totalY = doc.y;
  doc.fontSize(fs + 1).fillColor("#000");
  doc.text("THÀNH TIỀN", left, totalY, { width: contentW * 0.55, align: "left" });
  doc.text(fmt(data.total), left, totalY, { width: contentW, align: "right" });
  doc.y = totalY + fs + 6;
  doc.moveDown(0.2);

  if (data.isReprint) {
    doc.fontSize(fsTiny).fillColor("#888").text("*** IN LẠI ***", left, doc.y, {
      width: contentW,
      align: "center",
    });
    doc.moveDown(0.25);
  }

  if (cfg.footer) {
    hr(doc, contentW, left);
    doc.fontSize(fsSmall).fillColor("#444").text(String(cfg.footer), left, doc.y, {
      width: contentW,
      align: "center",
    });
    doc.moveDown(0.2);
  }
  if (cfg.extra_footer) {
    doc.fontSize(fsTiny).fillColor("#888").text(String(cfg.extra_footer), left, doc.y, {
      width: contentW,
      align: "center",
    });
    doc.moveDown(0.15);
  }

  doc.fillColor("#000");
}

function hr(doc, contentW, left) {
  const y = doc.y;
  doc.save();
  doc.strokeColor("#999").dash(2, { space: 2 });
  doc.moveTo(left, y).lineTo(left + contentW, y).stroke();
  doc.undash();
  doc.restore();
  doc.moveDown(0.4);
}

function ensurePage(doc, reserve) {
  if (doc.y + reserve > doc.page.maxY()) {
    doc.addPage(doc.page._options);
  }
}

function buildThermalPdfDocOptions(paperSizeMm) {
  const pw = Number(paperSizeMm) === 58 ? 58 : 80;
  const pageW = mmToPt(pw);
  const pageH = 842;
  return {
    size: [pageW, pageH],
    margin: { top: 12, bottom: 14, left: 9, right: 9 },
  };
}

module.exports = { renderBillPdf, mmToPt, buildThermalPdfDocOptions };
