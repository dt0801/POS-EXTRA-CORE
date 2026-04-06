async function postKitchenPrint(
  { useBridgeQueue, createPrintJob, dispatchReceiptToType },
  body
) {
  const { table_num, items = [] } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return { status: 400, body: { error: "Danh sách món không hợp lệ" } };
  }
  if (useBridgeQueue()) {
    try {
      const job = await createPrintJob("KITCHEN", null, {
        table_num,
        items,
        note: "",
      });
      return { status: 200, body: { success: true, job_id: Number(job.sqlite_id || 0) } };
    } catch (e) {
      return { status: 500, body: { error: e.message || String(e) } };
    }
  }

  const nowText = new Date().toLocaleString("vi-VN");
  const foodItems = items.filter((i) => i.type !== "DRINK");
  const drinkItems = items.filter((i) => i.type === "DRINK");
  const errors = [];

  try {
    if (foodItems.length > 0) {
      dispatchReceiptToType("KITCHEN", {
        title: "PHIẾU BẾP",
        subtitle: "ĐỒ ĂN",
        tableNum: table_num,
        timeLabel: "Giờ",
        timeValue: nowText,
        items: foodItems,
        footer: "Giao bếp",
        hidePrices: true,
      });
    }
  } catch (err) {
    errors.push(err.message);
  }

  try {
    if (drinkItems.length > 0) {
      dispatchReceiptToType("BILL", {
        title: "PHIẾU PHA CHẾ",
        subtitle: "NƯỚC",
        tableNum: table_num,
        timeLabel: "Giờ",
        timeValue: nowText,
        items: drinkItems,
        footer: "Pha chế",
        hidePrices: true,
      });
    }
  } catch (err) {
    errors.push(err.message);
  }

  if (errors.length && foodItems.length + drinkItems.length > 0) {
    return { status: 503, body: { error: errors.join(", ") } };
  }

  return { status: 200, body: { success: true } };
}

module.exports = { postKitchenPrint };
