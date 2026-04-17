/**
 * Cùng logic với pos-ui/src/hooks/billHTML.js — in / render-queue / Electron khớp preview.
 * Folder: server/print-templates/
 */

const {
  effectiveKitchenCategory,
  kitchenCategoryPrintLabelVi,
  kitchenPrintOrderFromSettings,
} = require("./kitchenCategoriesServer");

const BILL_TYPE_PREFIX = { bill: "bill_", tamtinh: "tamtinh_", kitchen: "kitchen_" };

function formatMoney(n) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    (Number(n) || 0) / 100
  );
}

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmt = (cents) => formatMoney(cents);

function buildCfg(settings, type) {
  const P = BILL_TYPE_PREFIX[type] || BILL_TYPE_PREFIX.bill;
  const get = (k) => settings[P + k] || "";
  const billPrefix = BILL_TYPE_PREFIX.bill;
  return {
    store_name: settings.store_name || "",
    store_logo: settings.store_logo || "",
    store_address: settings.store_address || "",
    store_phone: settings.store_phone || "",
    extra_header: get("extra_header"),
    extra_footer: get("extra_footer"),
    footer: get("footer"),
    font_size: get("font_size") || "13",
    font_style: get("font_style") || "normal",
    header_align: get("header_align") || "center",
    show_qty: type === "bill" ? settings[billPrefix + "show_qty"] : undefined,
    show_unit_price: type === "bill" ? settings[billPrefix + "show_unit_price"] : undefined,
  };
}

/**
 * @param {object} opts
 * @param {string} [opts.kitchenTitle] — mặc định PHIẾU BẾP
 * @param {string} [opts.kitchenTimeDisplay] — dòng giờ (vd. từ receipt.timeValue)
 * @param {string} [opts.preformattedDate] — ngày/giờ hiển thị bill/tạm tính
 * @param {number} [opts.paperSizeMm] — 58 | 80
 * @param {string} [opts.injectExtraCss] — bill_css_override
 * @param {string} [opts.appendFooter] — chèn thêm cuối bill (vd. cảm ơn từ receipt)
 */
function generateBillHTML(opts) {
  const {
    settings,
    type,
    tableNum,
    items,
    total,
    subtotal,
    discountPercent,
    discountAmount,
    tipAmount,
    cashGiven,
    changeDue,
    billId,
    createdAt,
    isReprint = false,
    kitchenTitle = "PHIẾU BẾP",
    kitchenTimeDisplay,
    preformattedDate,
    paperSizeMm = 80,
    injectExtraCss = "",
    appendFooter = "",
  } = opts;

  const cfg = buildCfg(settings, type);
  const fs = Number(cfg.font_size) || 13;
  const align = cfg.header_align;
  const fw = cfg.font_style === "bold" ? "bold" : "normal";
  const fi = cfg.font_style === "italic" ? "italic" : "normal";
  const dateStr = preformattedDate
    ? String(preformattedDate)
    : createdAt
      ? new Date(createdAt).toLocaleString("vi-VN")
      : new Date().toLocaleString("vi-VN");
  const timeStr = kitchenTimeDisplay || new Date().toLocaleTimeString("vi-VN");
  const pw = Number(paperSizeMm) === 58 ? 58 : 80;
  const maxW = pw === 58 ? 220 : 320;
  const logoMax = pw === 58 ? 52 : 68;

  const baseStyle = `
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      font-size:${fs}px;font-weight:${fw};font-style:${fi};
      width:100%;max-width:${maxW}px;margin:0 auto;padding:14px 12px;
      color:#111;background:#fff;line-height:1.45;letter-spacing:0.1px
    }
    .hr{border-top:1px dashed #999;margin:7px 0}
    .center{text-align:center}
    .right{text-align:right}
    .bold{font-weight:700}
    .sub{font-size:${Math.max(10, fs - 1)}px;color:#555}
    .muted{font-size:${Math.max(9, fs - 2)}px;color:#777}
    .row{display:flex;justify-content:space-between;gap:8px}
    .brand{display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:8px}
    .brand img{max-width:${logoMax}px;max-height:${logoMax}px;object-fit:contain}
    .meta{padding:6px 0}
    table{width:100%;border-collapse:collapse}
    th,td{padding:4px 2px;font-size:${fs}px;vertical-align:top}
    thead th{font-weight:700;border-bottom:1px dashed #999;padding-bottom:5px}
    .total{padding-top:4px}
    @media print{@page{size:${pw}mm auto;margin:2.5mm 1.8mm}body{max-width:100%;padding:8px 7px}}
  `;

  const extraStyleBlock = injectExtraCss && String(injectExtraCss).trim()
    ? `<style>${String(injectExtraCss)}</style>`
    : "";

  const defaultName = esc(cfg.store_name) || "CITRUS POS";
  const logoRaw = String(cfg.store_logo || "").trim();
  const logoSrc = logoRaw
    ? (/^https?:\/\//i.test(logoRaw)
      ? logoRaw
      : `/uploads/${logoRaw.replace(/^\/+/, "")}`)
    : "";
  const headerHTML = `
    <div style="text-align:${esc(align)};margin-bottom:8px" class="brand">
      ${logoSrc ? `<img src="${esc(logoSrc)}" alt="logo" />` : ""}
      <div style="font-size:${fs + 2}px;font-weight:800;letter-spacing:0.3px">${defaultName}</div>
      ${cfg.store_address ? `<div class="sub">${esc(cfg.store_address)}</div>` : ""}
      ${cfg.store_phone ? `<div class="sub">Tel: ${esc(cfg.store_phone)}</div>` : ""}
      ${cfg.extra_header ? `<div class="sub" style="margin-top:2px;white-space:pre-wrap">${esc(cfg.extra_header)}</div>` : ""}
    </div>
  `;

  const footerHTML = cfg.footer
    ? `<div class="hr"></div><div class="center sub" style="font-style:italic;white-space:pre-wrap">${esc(cfg.footer)}</div>`
    : "";
  const extraFooterHTML = cfg.extra_footer
    ? `<div class="center muted" style="margin-top:2px;white-space:pre-wrap">${esc(cfg.extra_footer)}</div>`
    : "";

  const appendFooterHTML =
    appendFooter && String(appendFooter).trim()
      ? `<div class="hr"></div><div class="center muted" style="margin-top:4px;white-space:pre-wrap">${esc(appendFooter)}</div>`
      : "";

  let bodyHTML = "";

  if (type === "kitchen") {
    const printOrder = kitchenPrintOrderFromSettings(settings);
    const rowHtml = (i) => {
      const note = i.note ? esc(i.note) : "";
      return `
        <div style="margin-bottom:6px">
          <div class="row" style="font-size:${fs + 1}px">
            <span>${esc(i.name)}</span>
            <span class="bold" style="font-size:${fs + 3}px">x${esc(i.qty)}</span>
          </div>
          ${note ? `<div style="font-size:${Math.max(9, fs - 2)}px;color:#c00;margin-left:12px">${note}</div>` : ""}
        </div>`;
    };
    const sections = [];
    let secIdx = 0;
    for (const cat of printOrder) {
      const list = items.filter((i) => effectiveKitchenCategory(i, settings) === cat);
      if (!list.length) continue;
      const sep =
        secIdx === 0
          ? `margin:4px 0 4px;font-size:${Math.max(11, fs)}px`
          : `margin:10px 0 4px;font-size:${Math.max(11, fs)}px;border-top:1px dashed #ccc;padding-top:6px`;
      secIdx += 1;
      sections.push(
        `<div class="center bold sub" style="${sep}">${esc(kitchenCategoryPrintLabelVi(settings, cat))}</div>${list.map(rowHtml).join("")}`
      );
    }
    const uncategorized = items.filter((i) => !printOrder.includes(effectiveKitchenCategory(i, settings)));
    if (uncategorized.length) {
      sections.push(uncategorized.map(rowHtml).join(""));
    }
    const kt = esc(kitchenTitle);
    bodyHTML = `
      <div class="center bold" style="font-size:${fs + 3}px;margin-bottom:4px">${kt}</div>
      <div class="center sub" style="margin-bottom:8px">Bàn <b>${esc(tableNum)}</b> | ${esc(timeStr)}</div>
      <div class="hr"></div>
      ${sections.join("")}
      <div class="hr"></div>
      ${cfg.footer ? `<div class="center sub" style="font-style:italic;white-space:pre-wrap">${esc(cfg.footer)}</div>` : ""}
    `;
    return wrapHTML(baseStyle, bodyHTML, `${kitchenTitle} - Bàn ${tableNum}`, extraStyleBlock);
  }

  if (type === "tamtinh") {
    bodyHTML = `
      ${headerHTML}
      <div class="hr"></div>
      <div class="sub meta" style="overflow:hidden">
        <span>Bàn: <b>${esc(tableNum)}</b></span>
        <span style="float:right">${esc(dateStr)}</span>
      </div>
      <div class="hr"></div>
      <div class="center bold" style="font-size:${fs + 1}px;margin-bottom:6px">** TẠM TÍNH **</div>
      ${items
        .map(
          (i) => `
        <div class="row" style="margin-bottom:3px">
          <span>${esc(i.name)} x${esc(i.qty)}</span>
          <span>${fmt(Number(i.price) * Number(i.qty))}</span>
        </div>`
        )
        .join("")}
      <div class="hr"></div>
      <div class="row bold total" style="font-size:${fs + 1}px">
        <span>TẠM TÍNH</span><span>${fmt(total)}</span>
      </div>
      <div class="center muted" style="margin-top:4px;font-style:italic">(Chưa thanh toán chính thức)</div>
      ${footerHTML}${extraFooterHTML}${appendFooterHTML}
    `;
    return wrapHTML(baseStyle, bodyHTML, `Tạm Tính - Bàn ${tableNum}`, extraStyleBlock);
  }

  const showQty = cfg.show_qty !== "false";
  const showUnitPrice = cfg.show_unit_price !== "false";
  const hasSubtotal = Number.isFinite(Number(subtotal)) && Number(subtotal) > 0;
  const sub = hasSubtotal ? Number(subtotal) : Number(total || 0);
  const discAmt = Number(discountAmount || 0);
  const discPct = Number(discountPercent || 0);
  const tipAmt = Number(tipAmount || 0);
  const cash = Number(cashGiven || 0);
  const change = Number(changeDue || 0);
  bodyHTML = `
    ${headerHTML}
    <div class="hr"></div>
    <div class="sub meta" style="overflow:hidden">
      <span>Bàn: <b>${esc(tableNum)}</b>${billId ? ` · HD#${esc(billId)}` : ""}</span>
      <span style="float:right">${esc(dateStr)}</span>
    </div>
    <div class="hr"></div>
    <table>
      <thead>
        <tr>
          <th style="text-align:left;padding-bottom:3px">Món</th>
          ${showQty ? `<th style="text-align:center;width:28px">SL</th>` : ""}
          ${showUnitPrice ? `<th style="text-align:right;width:60px">Đơn</th>` : ""}
          <th style="text-align:right;width:70px">T.Tiền</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (i, idx) => `
          <tr>
            <td style="padding-top:3px">${idx + 1}. ${esc(i.name)}</td>
            ${showQty ? `<td style="text-align:center">${esc(i.qty)}</td>` : ""}
            ${showUnitPrice ? `<td style="text-align:right;color:#555">${fmt(i.price)}</td>` : ""}
            <td style="text-align:right">${fmt(Number(i.price) * Number(i.qty))}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <div class="hr"></div>
    <div class="row bold total" style="font-size:${fs + 1}px">
      <span>TẠM TÍNH</span><span>${fmt(sub)}</span>
    </div>
    ${discAmt > 0
      ? `<div class="row sub" style="margin-top:2px">
        <span>GIẢM GIÁ${discPct > 0 ? ` (${esc(discPct)}%)` : ""}</span><span style="color:#c00">- ${fmt(discAmt)}</span>
      </div>`
      : ""}
    ${tipAmt > 0
      ? `<div class="row sub" style="margin-top:2px">
        <span>TIỀN BO</span><span>+ ${fmt(tipAmt)}</span>
      </div>`
      : ""}
    <div class="row bold total" style="font-size:${fs + 2}px;margin-top:5px">
      <span>THÀNH TIỀN</span><span>${fmt(total)}</span>
    </div>
    ${cash > 0 || change > 0
      ? `<div class="hr"></div>
        <div class="row sub"><span>TIỀN KHÁCH ĐƯA</span><span>${fmt(cash)}</span></div>
        <div class="row sub bold" style="margin-top:2px"><span>TIỀN THỪA</span><span>${fmt(change)}</span></div>`
      : ""}
    ${isReprint ? `<div class="center muted" style="margin-top:4px">*** IN LẠI ***</div>` : ""}
    ${footerHTML}${extraFooterHTML}${appendFooterHTML}
  `;
  return wrapHTML(baseStyle, bodyHTML, `Hóa Đơn - Bàn ${tableNum}`, extraStyleBlock);
}

function wrapHTML(style, body, title, extraStyleBlock = "") {
  return `<!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>${esc(title)}</title>
    <style>${style}</style>
    ${extraStyleBlock || ""}
  </head><body>${body}</body></html>`;
}

module.exports = {
  generateBillHTML,
  buildCfg,
  formatMoney,
  BILL_TYPE_PREFIX,
};
