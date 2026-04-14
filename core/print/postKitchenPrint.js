const { dispatchToBridge } = require("./dispatchToBridge");
const { parseKitchenCategoriesList } = require("../../server/print-templates/kitchenCategoriesServer");

/**
 * Xác định printer destination cho 1 item dựa vào kitchen_category + settings.
 * - DRINK → luôn "BAR"
 * - FOOD  → tra kitchen_categories_json, lấy printer_dest (default "KITCHEN")
 */
/**
 * Trả về { dest, groupKey } cho mỗi item.
 * - dest: printer type để gửi (KITCHEN, BAR, ...)
 * - groupKey: key để tách phiếu riêng (dest + category)
 */
function resolveItemRouting(item, settings) {
  if (item.type === "DRINK") {
    return { dest: "BAR", groupKey: "BAR__DRINK" };
  }
  const cats = parseKitchenCategoriesList(settings);
  const catId = item.kitchen_category || "MAIN";
  const cat = cats.find((c) => c.id === catId);
  const dest = cat?.printer_dest || "KITCHEN";
  return { dest, groupKey: `${dest}__${catId}` };
}

const GROUP_LABELS = {
  DRINK:     { title: "PHIẾU PHA CHẾ", subtitle: "NƯỚC", footer: "Pha chế" },
  SUSHI:     { title: "PHIẾU BAR", subtitle: "SUSHI", footer: "Bar" },
  APPETIZER: { title: "PHIẾU BẾP", subtitle: "KHAI VỊ", footer: "Giao bếp" },
  MAIN:      { title: "PHIẾU BẾP", subtitle: "MÓN CHÍNH", footer: "Giao bếp" },
};

function buildReceiptData(dest, catId, table_num, items, nowText, settings) {
  const labels = GROUP_LABELS[catId]
    || (dest === "BAR"
      ? { title: "PHIẾU BAR", subtitle: String(catId).toUpperCase(), footer: "Bar" }
      : { title: "PHIẾU BẾP", subtitle: String(catId).toUpperCase(), footer: "Giao bếp" });
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

  // Group items theo groupKey (dest + category) → mỗi group = 1 phiếu riêng
  const groups = {};
  for (const item of items) {
    const { dest, groupKey } = resolveItemRouting(item, settingsCache || {});
    if (!groups[groupKey]) groups[groupKey] = { dest, catId: item.type === "DRINK" ? "DRINK" : (item.kitchen_category || "MAIN"), items: [] };
    groups[groupKey].items.push(item);
  }

  if (useBridgeQueue()) {
    try {
      const jobIds = [];
      for (const g of Object.values(groups)) {
        const data = buildReceiptData(g.dest, g.catId, table_num, g.items, nowText, settingsCache);
        const ids = await dispatchToBridge(
          { enqueueJobsForType, createPrintJob },
          g.dest,
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
  for (const g of Object.values(groups)) {
    try {
      const data = buildReceiptData(g.dest, g.catId, table_num, g.items, nowText, settingsCache);
      dispatchReceiptToType(g.dest, data);
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
