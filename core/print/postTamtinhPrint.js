const { dispatchToBridge } = require("./dispatchToBridge");

async function postTamtinhPrint(
  { useBridgeQueue, createPrintJob, dispatchReceiptToType, getStoreProfile, enqueueJobsForType },
  body
) {
  const { table_num, items = [], total } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return { status: 400, body: { error: "Danh sách món không hợp lệ" } };
  }

  const store = getStoreProfile();
  const receiptData = {
    title: store.storeName || "TẠM TÍNH",
    tableNum: table_num,
    timeLabel: "Giờ",
    timeValue: new Date().toLocaleString("vi-VN"),
    items,
    totalLabel: "TẠM TÍNH",
    totalValue: total,
    billNo: "--",
    cashier: store.cashierName,
    footer: "",
    groupItemsByType: true,
  };

  if (useBridgeQueue()) {
    try {
      const ids = await dispatchToBridge(
        { enqueueJobsForType, createPrintJob },
        "TAMTINH",
        null,
        receiptData
      );
      return { status: 200, body: { success: true, job_ids: ids } };
    } catch (e) {
      return { status: e.statusCode || 500, body: { error: e.message || String(e) } };
    }
  }

  try {
    const sent = dispatchReceiptToType("TAMTINH", receiptData);
    return { status: 200, body: { success: true, queued: sent } };
  } catch (err) {
    return { status: err.statusCode || 500, body: { error: err.message } };
  }
}

module.exports = { postTamtinhPrint };
