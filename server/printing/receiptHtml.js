/**
 * Template HTML hóa đơn / phiếu bếp — tách khỏi server.js để dễ chỉnh layout/CSS.
 */

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Giá trong DB/API là đơn vị nghìn (12 = 12.000đ), giống formatMoney ở pos-ui */
function formatMoney(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat("vi-VN").format(n * 1000) + "đ";
}

function createBuildReceiptHtml(ctx) {
  const { getBillCssOverride, getStoreProfile } = ctx;

  function buildReceiptHtml({
    title,
    subtitle,
    tableNum,
    timeLabel,
    timeValue,
    items,
    totalLabel,
    totalValue,
    footer,
    billNo,
    cashier,
    customer,
    hidePrices = false,
    groupItemsByType = false,
  }, paperSize = 80, cssOverride) {
    const pageWidth = Number(paperSize) === 58 ? "58mm" : "80mm";
  
    function renderOneItemRow(item, idx) {
      const qty = Number(item.qty) || 0;
      const lineTotal = (Number(item.price) || 0) * qty;
      const noteHtml = item.note
        ? `<div class="item-note">- ${escapeHtml(item.note)}</div>`
        : "";
      if (hidePrices) {
        return `
        <div class="item">
          <div class="item-row">
            <span class="item-name">${idx + 1}) ${escapeHtml(item.name)}</span>
            <span class="item-qty">${qty}</span>
          </div>
          ${noteHtml}
        </div>
      `;
      }
      return `
        <div class="item">
          <div class="item-row">
            <span class="item-name">${idx + 1}) ${escapeHtml(item.name)}</span>
            <span class="item-qty">${qty}</span>
            <span class="item-unit-price">${formatMoney(item.price)}</span>
            <span class="item-price">${formatMoney(lineTotal)}</span>
          </div>
          ${noteHtml}
        </div>
      `;
    }
  
    function getItemType(i) {
      const t = i.type ?? i.item_type;
      return t === "DRINK" ? "DRINK" : "FOOD";
    }
  
    const list = items || [];
    let itemHtml = "";
  
    if (groupItemsByType && !hidePrices) {
      const foods = list.filter((i) => getItemType(i) !== "DRINK");
      const drinks = list.filter((i) => getItemType(i) === "DRINK");
      const parts = [];
      let idx = 0;
      if (foods.length) {
        parts.push(`<div class="item-group-label">Đồ ăn &amp; combo</div>`);
        foods.forEach((item) => {
          parts.push(renderOneItemRow(item, idx));
          idx += 1;
        });
      }
      if (drinks.length) {
        parts.push(`<div class="item-group-label">Đồ uống</div>`);
        drinks.forEach((item) => {
          parts.push(renderOneItemRow(item, idx));
          idx += 1;
        });
      }
      itemHtml = parts.length ? parts.join("") : list.map((item, i) => renderOneItemRow(item, i)).join("");
    } else {
      itemHtml = list.map((item, idx) => renderOneItemRow(item, idx)).join("");
    }
  
    const summaryHtml = totalValue !== undefined
      ? `
        <div class="summary">
          <span class="sum-label">${escapeHtml(totalLabel || "TONG CONG")}</span>
          <span class="sum-value">${formatMoney(totalValue)}</span>
        </div>
      `
      : "";
  
    const footerHtml = footer ? `<div class="footer">${escapeHtml(footer)}</div>` : "";
  
    const finalCssOverride = typeof cssOverride === "string" ? cssOverride : getBillCssOverride();
  
    const upperTitle = String(title || "").toUpperCase();
    const documentTitle = upperTitle.includes("BEP")
      ? "PHIẾU BẾP"
      : upperTitle.includes("PHA CHE")
      ? "PHIẾU PHA CHẾ"
      : totalLabel === "TẠM TÍNH" || totalLabel === "TAM TINH"
      ? "PHIẾU TẠM TÍNH"
      : "HÓA ĐƠN THANH TOÁN";
  
    const theadHtml = hidePrices
      ? `<div class="thead">
      <span>TÊN HÀNG</span>
      <span>SL</span>
    </div>`
      : `<div class="thead">
      <span>TÊN HÀNG</span>
      <span>SL</span>
      <span>ĐƠN GIÁ</span>
      <span>T.TIỀN</span>
    </div>`;
  
    return `
  <!doctype html>
  <html>
  <head>
  <meta charset="utf-8" />
  <style>
    @page { size: ${pageWidth} auto; margin: 2mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: ${pageWidth};
      min-height: 100vh;
      color: #000;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.32;
      font-weight: 400;
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: antialiased;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      display: flex;
      justify-content: center;
    }
    .wrap {
      width: calc(${pageWidth} - 4mm);
      max-width: calc(${pageWidth} - 4mm);
      padding: 2mm 2mm 1.6mm;
    }
    .title {
      text-align: center;
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.2px;
      text-transform: uppercase;
    }
    .subtitle {
      text-align: center;
      font-size: 11px;
      font-weight: 400;
      margin-top: 1px;
      opacity: 0.9;
    }
    .section-title {
      text-align: center;
      font-size: 13px;
      font-weight: 600;
      margin: 7px 0 3px;
      text-transform: uppercase;
      letter-spacing: 0.1px;
    }
    .meta-grid {
      margin-top: 2px;
      margin-bottom: 6px;
    }
    .meta-line {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      font-size: 11px;
      font-weight: 400;
    }
    .meta-line b { font-weight: 600; }
    .divider {
      border-top: 1px solid #000;
      margin: 3px 0;
      opacity: 0.7;
    }
    .wrap.receipt-no-prices .thead,
    .wrap.receipt-no-prices .item-row {
      grid-template-columns: 1fr 40px;
    }
    .wrap.receipt-no-prices .thead span:nth-child(2),
    .wrap.receipt-no-prices .item-qty {
      text-align: right;
    }
    .thead, .item-row, .summary {
      display: grid;
      grid-template-columns: 1fr 24px 52px 58px;
      align-items: baseline;
      column-gap: 3px;
    }
    .thead {
      font-size: 10px;
      font-weight: 600;
      margin: 4px 0 2px;
      letter-spacing: 0.1px;
    }
    .thead span:nth-child(2),
    .thead span:nth-child(3),
    .thead span:nth-child(4) {
      text-align: right;
    }
    .item { margin-bottom: 1px; }
    .item-row {
      font-size: 11px;
    }
    .item-name {
      overflow-wrap: anywhere;
      font-weight: 700;
    }
    .item-qty,
    .item-unit-price,
    .item-price {
      text-align: center;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
    }
    .item-unit-price,
    .item-price {
      text-align: right;
    }
    .item-group-label {
      font-size: 10px;
      font-weight: 700;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.15px;
      margin: 7px 0 4px;
      padding-top: 5px;
      border-top: 1px dashed #888;
    }
    .item-group-label:first-child {
      margin-top: 0;
      padding-top: 0;
      border-top: none;
    }
    .item-note {
      margin-top: 1px;
      margin-left: 10px;
      font-size: 10px;
      font-weight: 400;
      font-style: italic;
      opacity: 0.9;
    }
    .summary {
      font-size: 12px;
      font-weight: 600;
      margin-top: 2px;
    }
    .summary .sum-label {
      grid-column: 1 / span 3;
    }
    .summary .sum-value {
      text-align: right;
    }
    .footer {
      text-align: center;
      margin-top: 7px;
      font-size: 10px;
      font-weight: 500;
      opacity: 0.9;
    }
    ${finalCssOverride || ""}
  </style>
  </head>
  <body>
  <div class="wrap${hidePrices ? " receipt-no-prices" : ""}">
    <div class="title">${escapeHtml(title || "PHIẾU IN")}</div>
    ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}
    <div class="section-title">${escapeHtml(documentTitle)}</div>
    <div class="meta-grid">
      <div class="meta-line"><span>Số HĐ</span><b>${escapeHtml(billNo || "--")}</b></div>
      <div class="meta-line"><span>${escapeHtml(timeLabel || "Thoi gian")}</span><b>${escapeHtml(timeValue)}</b></div>
      <div class="meta-line"><span>Bàn</span><b>${escapeHtml(tableNum)}</b></div>
      <div class="meta-line"><span>Thu ngân</span><b>${escapeHtml(cashier || getStoreProfile().cashierName)}</b></div>
      <div class="meta-line"><span>Khách hàng</span><b>${escapeHtml(customer || "")}</b></div>
    </div>
    <div class="divider"></div>
    ${theadHtml}
    <div class="divider"></div>
    ${itemHtml || "<div>Không có món nào.</div>"}
    ${summaryHtml ? `<div class="divider"></div>${summaryHtml}` : ""}
    ${footerHtml}
  </div>
  </body>
  </html>
    `;
  }

  return { buildReceiptHtml };
}

module.exports = { createBuildReceiptHtml, escapeHtml, formatMoney };
