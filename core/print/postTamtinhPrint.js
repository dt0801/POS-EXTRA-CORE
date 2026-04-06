async function postTamtinhPrint(
  { useBridgeQueue, createPrintJob, dispatchReceiptToType, getStoreProfile },
  body
) {
  const { table_num, items = [], total } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return { status: 400, body: { error: "Danh sách món không hợp lệ" } };
  }
  if (useBridgeQueue()) {
    try {
      const job = await createPrintJob("TAMTINH", null, {
        table_num,
        items,
        total,
      });
      return { status: 200, body: { success: true, job_id: Number(job.sqlite_id || 0) } };
    } catch (e) {
      return { status: 500, body: { error: e.message || String(e) } };
    }
  }

  try {
    const store = getStoreProfile();
    const sent = dispatchReceiptToType("TAMTINH", {
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
    });
    return { status: 200, body: { success: true, queued: sent } };
  } catch (err) {
    return { status: err.statusCode || 500, body: { error: err.message } };
  }
}

module.exports = { postTamtinhPrint };
