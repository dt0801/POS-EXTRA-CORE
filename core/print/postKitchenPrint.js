const { dispatchToBridge } = require("./dispatchToBridge");

async function postKitchenPrint(
  { useBridgeQueue, createPrintJob, dispatchReceiptToType, enqueueJobsForType },
  body
) {
  const { table_num, items = [] } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return { status: 400, body: { error: "Danh sách món không hợp lệ" } };
  }

  const nowText = new Date().toLocaleString("vi-VN");
  const foodItems = items.filter((i) => i.type !== "DRINK");
  const drinkItems = items.filter((i) => i.type === "DRINK");

  const foodData = {
    title: "PHIẾU BẾP",
    subtitle: "ĐỒ ĂN",
    tableNum: table_num,
    timeLabel: "Giờ",
    timeValue: nowText,
    items: foodItems,
    footer: "Giao bếp",
    hidePrices: true,
  };
  const drinkData = {
    title: "PHIẾU PHA CHẾ",
    subtitle: "NƯỚC",
    tableNum: table_num,
    timeLabel: "Giờ",
    timeValue: nowText,
    items: drinkItems,
    footer: "Pha chế",
    hidePrices: true,
  };

  if (useBridgeQueue()) {
    try {
      const jobIds = [];
      if (foodItems.length > 0) {
        const ids = await dispatchToBridge(
          { enqueueJobsForType, createPrintJob },
          "KITCHEN",
          null,
          foodData
        );
        jobIds.push(...ids);
      }
      if (drinkItems.length > 0) {
        const ids = await dispatchToBridge(
          { enqueueJobsForType, createPrintJob },
          "BILL",
          null,
          drinkData
        );
        jobIds.push(...ids);
      }
      return { status: 200, body: { success: true, job_ids: jobIds } };
    } catch (e) {
      return { status: e.statusCode || 500, body: { error: e.message || String(e) } };
    }
  }

  const errors = [];
  try {
    if (foodItems.length > 0) dispatchReceiptToType("KITCHEN", foodData);
  } catch (err) {
    errors.push(err.message);
  }
  try {
    if (drinkItems.length > 0) dispatchReceiptToType("BILL", drinkData);
  } catch (err) {
    errors.push(err.message);
  }

  if (errors.length && foodItems.length + drinkItems.length > 0) {
    return { status: 503, body: { error: errors.join(", ") } };
  }
  return { status: 200, body: { success: true } };
}

module.exports = { postKitchenPrint };
