/**
 * HTML phiếu in — dùng cùng template với preview (billHTMLServer / pos-ui billHTML.js).
 */

const { generateBillHTML, formatMoney } = require("./billHTMLServer");

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeKitchenItems(items) {
  return (items || []).map((i) => ({
    name: i.name ?? "",
    qty: i.qty ?? 1,
    note: i.note || "",
    type: i.type || i.item_type || "FOOD",
    kitchen_category: i.kitchen_category,
  }));
}

function normalizePricingItems(items) {
  return (items || []).map((i) => ({
    name: i.name ?? i.item_name ?? "",
    price: Number(i.price) || 0,
    qty: i.qty ?? 1,
  }));
}

function createBuildReceiptHtml(ctx) {
  const { getBillCssOverride, getBillSettings } = ctx;

  function buildReceiptHtml(receipt, paperSize = 80, cssOverride) {
    const settings = typeof getBillSettings === "function" ? getBillSettings() || {} : {};
    const ps = Number(paperSize) || 80;
    const extraCss = typeof cssOverride === "string" ? cssOverride : getBillCssOverride();

    const totalLbl = String(receipt.totalLabel || "")
      .toUpperCase()
      .replace(/\s+/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const isTamTinh = totalLbl.includes("TAMTINH");

    if (receipt.hidePrices) {
      const title = String(receipt.title || "").trim() || "PHIẾU BẾP";
      return generateBillHTML({
        settings,
        type: "kitchen",
        tableNum: receipt.tableNum,
        items: normalizeKitchenItems(receipt.items),
        total: 0,
        kitchenTitle: title,
        kitchenTimeDisplay: receipt.timeValue,
        paperSizeMm: ps,
        injectExtraCss: extraCss,
      });
    }

    if (isTamTinh) {
      return generateBillHTML({
        settings,
        type: "tamtinh",
        tableNum: receipt.tableNum,
        items: normalizePricingItems(receipt.items),
        total: Number(receipt.totalValue) || 0,
        preformattedDate: receipt.timeValue,
        paperSizeMm: ps,
        injectExtraCss: extraCss,
        appendFooter: receipt.footer,
      });
    }

    const billNo = receipt.billNo;
    const bid =
      billNo !== undefined && billNo !== null && billNo !== "" && String(billNo) !== "--"
        ? billNo
        : undefined;

    return generateBillHTML({
      settings,
      type: "bill",
      tableNum: receipt.tableNum,
      items: normalizePricingItems(receipt.items),
      total: Number(receipt.totalValue) || 0,
      billId: bid,
      preformattedDate: receipt.timeValue,
      isReprint: /IN LẠI/i.test(String(receipt.footer || "")),
      paperSizeMm: ps,
      injectExtraCss: extraCss,
      appendFooter: receipt.footer,
    });
  }

  return { buildReceiptHtml };
}

module.exports = { createBuildReceiptHtml, escapeHtml, formatMoney };
