// Generate HTML bill / tạm tính / phiếu bếp — dùng chung preview & in trình duyệt
// Prefix settings: bill_ | tamtinh_ | kitchen_
import { formatMoney } from "../utils/posHelpers";
import {
  KITCHEN_PRINT_ORDER_FROM_SETTINGS,
  effectiveKitchenCategory,
  kitchenCategoryPrintLabelVi,
} from "../constants/kitchenCategories";

export const BILL_TYPE_PREFIX = { bill: "bill_", tamtinh: "tamtinh_", kitchen: "kitchen_" };

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmt = (cents) => formatMoney(cents);

export function buildCfg(settings, type) {
  const P = BILL_TYPE_PREFIX[type] || BILL_TYPE_PREFIX.bill;
  const get = (k) => settings[P + k] || "";
  const billPrefix = BILL_TYPE_PREFIX.bill;
  return {
    store_name: settings.store_name || "",
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

export function generateBillHTML({
  settings,
  type,
  tableNum,
  items,
  total,
  subtotal,
  discountPercent,
  discountAmount,
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
}) {
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

  const baseStyle = `
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:monospace;font-size:${fs}px;font-weight:${fw};font-style:${fi};
         width:100%;max-width:${maxW}px;margin:0 auto;padding:16px;color:#000;background:#fff;line-height:1.6}
    .hr{border-top:1px dashed #999;margin:5px 0}
    .center{text-align:center}
    .right{text-align:right}
    .bold{font-weight:bold}
    .sub{font-size:${Math.max(10, fs - 1)}px;color:#555}
    .muted{font-size:${Math.max(9, fs - 2)}px;color:#888}
    .row{display:flex;justify-content:space-between}
    table{width:100%;border-collapse:collapse}
    th,td{padding:3px 2px;font-size:${fs}px}
    @media print{@page{size:${pw}mm auto;margin:3mm 2mm}body{max-width:100%;padding:8px}}
  `;

  const extraStyleBlock =
    injectExtraCss && String(injectExtraCss).trim()
      ? `<style>${String(injectExtraCss)}</style>`
      : "";

  const defaultName = esc(cfg.store_name) || "CITRUS POS";
  const headerHTML = `
    <div style="text-align:${esc(align)};margin-bottom:8px">
      <div style="font-size:${fs + 2}px;font-weight:bold">${defaultName}</div>
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
    const printOrder = KITCHEN_PRINT_ORDER_FROM_SETTINGS(settings);
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
    const uncategorized = items.filter(
      (i) => !printOrder.includes(effectiveKitchenCategory(i, settings))
    );
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
      <div class="sub" style="overflow:hidden">
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
      <div class="row bold" style="font-size:${fs + 1}px">
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
  const cash = Number(cashGiven || 0);
  const change = Number(changeDue || 0);
  bodyHTML = `
    ${headerHTML}
    <div class="hr"></div>
    <div class="sub" style="overflow:hidden">
      <span>Bàn: <b>${esc(tableNum)}</b>${billId ? ` · HD#${esc(billId)}` : ""}</span>
      <span style="float:right">${esc(dateStr)}</span>
    </div>
    <div class="hr"></div>
    <table>
      <thead>
        <tr style="border-bottom:1px dashed #999">
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
    <div class="row bold" style="font-size:${fs + 1}px">
      <span>TẠM TÍNH</span><span>${fmt(sub)}</span>
    </div>
    ${discAmt > 0
      ? `<div class="row sub" style="margin-top:2px">
        <span>GIẢM GIÁ${discPct > 0 ? ` (${esc(discPct)}%)` : ""}</span><span style="color:#c00">- ${fmt(discAmt)}</span>
      </div>`
      : ""}
    <div class="row bold" style="font-size:${fs + 2}px;margin-top:5px">
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
