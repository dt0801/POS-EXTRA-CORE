const { dispatchToBridge } = require("./dispatchToBridge");
const { parseKitchenCategoriesList } = require("../../server/print-templates/kitchenCategoriesServer");

/**
 * Xác định printer destination cho 1 item dựa vào kitchen_category + settings.
 * - DRINK → luôn "BAR"
 * - FOOD  → tra kitchen_categories_json, lấy printer_dest (default "KITCHEN")
 */
function resolveItemPrinterDest(item, settings) {
  if (item.type === "DRINK") return "BAR";
  const cats = parseKitchenCategoriesList(settings);
  const catId = item.kitchen_category || "MAIN";
  const cat = cats.find((c) => c.id === catId);
  return cat?.printer_dest || "KITCHEN";
}

const DEST_LABELS = {
  KITCHEN: { title: "PHIẾU BẾP", subtitle: "ĐỒ ĂN", footer: "Giao bếp" },
  BAR:     { title: "PHIẾU PHA CHẾ", subtitle: "NƯỚC / BAR", footer: "Pha chế" },
};

function buildReceiptData(dest, table_num, items, nowText) {
  const labels = DEST_LABELS[dest] || { title: `PHIẾU ${dest}`, subtitle: dest, footer: dest };
  return {
    title: labels.title,
    subtitle: labels.subtitle,
    tableNum: table_num,
    timeLabel: "Giờ",
    timeValue: nowText,
    items,
    footer: labels.footer,
    hidePrices: true,
  };
}

async function postKitchenPrint(
  { useBridgeQueue, createPrintJob, dispatchReceiptToType, enqueueJobsForType, settingsCache },
  body
) {
  const { table_num, items = [] } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return { status: 400, body: { error: "Danh sách món không hợp lệ" } };
  }

  const nowText = new Date().toLocaleString("vi-VN");

  // Group items theo printer destination
  const groups = {};
  for (const item of items) {
    const dest = resolveItemPrinterDest(item, settingsCache || {});
    if (!groups[dest]) groups[dest] = [];
    groups[dest].push(item);
  }

  if (useBridgeQueue()) {
    try {
      const jobIds = [];
      for (const [dest, destItems] of Object.entries(groups)) {
        const data = buildReceiptData(dest, table_num, destItems, nowText);
        const ids = await dispatchToBridge(
          { enqueueJobsForType, createPrintJob },
          dest,
          null,
          data
        );
        jobIds.push(...ids);
      }
      return { status: 200, body: { success: true, job_ids: jobIds } };
    } catch (e) {
      return { status: e.statusCode || 500, body: { error: e.message || String(e) } };
    }
  }

  const errors = [];
  for (const [dest, destItems] of Object.entries(groups)) {
    try {
      const data = buildReceiptData(dest, table_num, destItems, nowText);
      dispatchReceiptToType(dest, data);
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (errors.length && items.length > 0) {
    return { status: 503, body: { error: errors.join(", ") } };
  }
  return { status: 200, body: { success: true } };
}

module.exports = { postKitchenPrint };
