const { mongoBillBySqliteId, mongoItemsByBillId } = require("../bill/mongoBillIds");
const { dispatchToBridge } = require("./dispatchToBridge");

async function postBillReprintPrint(
  { mongoDb, useBridgeQueue, createPrintJob, dispatchReceiptToType, getStoreProfile, enqueueJobsForType },
  billId
) {
  try {
    const bill = await mongoDb.collection("bills").findOne(mongoBillBySqliteId(billId));
    if (!bill) return { status: 404, body: { error: "Không tìm thấy hóa đơn" } };

    const items = await mongoDb
      .collection("bill_items")
      .find(mongoItemsByBillId(billId))
      .sort({ sqlite_id: 1 })
      .toArray();

    const store = getStoreProfile();
    const receiptData = {
      title: store.storeName,
      subtitle: store.storeSubtitle,
      tableNum: Number(bill.table_num || 0),
      timeLabel: "Ngày",
      timeValue: new Date(bill.created_at).toLocaleString("vi-VN"),
      items,
      totalLabel: "THÀNH TIỀN",
      totalValue: Number(bill.total || 0),
      billNo: Number(bill.sqlite_id ?? bill.id ?? billId),
      cashier: store.cashierName,
      reprint: true,
      footer: "",
      groupItemsByType: true,
    };

    if (useBridgeQueue()) {
      try {
        const ids = await dispatchToBridge(
          { enqueueJobsForType, createPrintJob },
          "BILL",
          billId,
          receiptData
        );
        return { status: 200, body: { success: true, job_ids: ids } };
      } catch (err) {
        return { status: err.statusCode || 500, body: { error: err.message || String(err) } };
      }
    }

    try {
      const sent = dispatchReceiptToType("BILL", receiptData);
      return { status: 200, body: { success: true, queued: sent } };
    } catch (err) {
      return { status: err.statusCode || 500, body: { error: err.message } };
    }
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { postBillReprintPrint };
