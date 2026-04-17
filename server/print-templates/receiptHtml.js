/**
 * HTML phiếu in — đồng bộ preview (pos-ui billHTML.js).
 * Folder: server/print-templates/
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

/** Tránh lặp dòng *** IN LẠI *** (template đã có khi isReprint). */
function appendFooterForBill(receipt) {
  const raw = String(receipt.footer || "").trim();
  const isReprint =
    Boolean(receipt.reprint) || /\bIN\s+L[ẠA]I\b/i.test(raw);
  if (!raw) return { isReprint, appendFooter: "" };
  if (!isReprint) return { isReprint: false, appendFooter: raw };
  let rest = raw.replace(/\*+\s*IN\s+L[ẠA]I\s*\*+/gi, "").replace(/^[\s\-–:;|]+/g, "").trim();
  return { isReprint, appendFooter: rest };
}

function createBuildReceiptHtml(ctx) {
  const { getBillCssOverride, getBillSettings } = ctx;

  function buildReceiptHtml(receipt, paperSize = 80, cssOverride) {
    const settings = typeof getBillSettings === "function" ? getBillSettings() || {} : {};
    const ps = Number(paperSize) || 80;
    const extraCss = typeof cssOverride === "string" ? cssOverride : getBillCssOverride();
    const language = String(receipt.language || "").toLowerCase() === "de" ? "de" : "vi";

    const totalLbl = String(receipt.totalLabel || "")
      .toUpperCase()
      .replace(/\s+/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const isTamTinh = totalLbl.includes("TAMTINH");

    if (receipt.hidePrices) {
      const title =
        String(receipt.title || "").trim() ||
        (language === "de" ? "KÜCHENBON" : "PHIẾU BẾP");
      return generateBillHTML({
        settings,
        type: "kitchen",
        language,
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
        language,
        tableNum: receipt.tableNum,
        items: normalizePricingItems(receipt.items),
        total: Number(receipt.totalValue) || 0,
        preformattedDate: receipt.timeValue,
        paperSizeMm: ps,
        injectExtraCss: extraCss,
        appendFooter: String(receipt.footer || "").trim(),
      });
    }

    const billNo = receipt.billNo;
    const bid =
      billNo !== undefined && billNo !== null && billNo !== "" && String(billNo) !== "--"
        ? billNo
        : undefined;

    const { isReprint, appendFooter } = appendFooterForBill(receipt);

    return generateBillHTML({
      settings,
      type: "bill",
      language,
      tableNum: receipt.tableNum,
      items: normalizePricingItems(receipt.items),
      total: Number(receipt.totalValue) || 0,
      subtotal: Number(receipt.subtotalValue) || 0,
      discountPercent: Number(receipt.discountPercent) || 0,
      discountAmount: Number(receipt.discountAmount) || 0,
      cashGiven: Number(receipt.cashGiven) || 0,
      changeDue: Number(receipt.changeDue) || 0,
      billId: bid,
      preformattedDate: receipt.timeValue,
      isReprint,
      paperSizeMm: ps,
      injectExtraCss: extraCss,
      appendFooter,
    });
  }

  return { buildReceiptHtml };
}

module.exports = { createBuildReceiptHtml, escapeHtml, formatMoney };
