const { dispatchToBridge } = require("./dispatchToBridge");

async function postBillPrint(
  { useBridgeQueue, createPrintJob, dispatchReceiptToType, getStoreProfile, enqueueJobsForType },
  body
) {
  const {
    table_num,
    items = [],
    total,
    subtotal,
    discount_percent,
    discount_amount,
    cash_given,
    change_due,
  } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return { status: 400, body: { error: "Danh sách món không hợp lệ" } };
  }

  const store = getStoreProfile();
  const receiptData = {
    title: store.storeName,
    subtitle: store.storeSubtitle,
    tableNum: table_num,
    timeLabel: "Ngày",
    timeValue: new Date().toLocaleString("vi-VN"),
    items,
    totalLabel: "THÀNH TIỀN",
    totalValue: total,
    subtotalValue: subtotal,
    discountPercent: discount_percent,
    discountAmount: discount_amount,
    cashGiven: cash_given,
    changeDue: change_due,
    billNo: "--",
    cashier: store.cashierName,
    footer: "",
    groupItemsByType: true,
  };

  if (useBridgeQueue()) {
    try {
      const ids = await dispatchToBridge(
        { enqueueJobsForType, createPrintJob },
        "BILL",
        null,
        receiptData
      );
      return { status: 200, body: { success: true, job_ids: ids } };
    } catch (e) {
      return { status: e.statusCode || 500, body: { error: e.message || String(e) } };
    }
  }

  try {
    const sent = dispatchReceiptToType("BILL", receiptData);
    return { status: 200, body: { success: true, queued: sent } };
  } catch (err) {
    console.error("Lỗi in hóa đơn:", err);
    return { status: err.statusCode || 500, body: { error: err.message } };
  }
}

module.exports = { postBillPrint };
