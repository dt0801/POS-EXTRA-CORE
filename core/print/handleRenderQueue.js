const { mongoBillBySqliteId, mongoItemsByBillId } = require("../bill/mongoBillIds");

async function handleRenderQueue(
  { mongoDb, enqueueJobsForType, getStoreProfile },
  body
) {
  const { action } = body || {};
  try {
    if (action === "kitchen") {
      const { table_num, items = [] } = body;
      if (!Array.isArray(items) || items.length === 0) {
        return { status: 400, body: { error: "Danh sách món không hợp lệ" } };
      }
      const nowText = new Date().toLocaleString("vi-VN");
      const foodItems = items.filter((i) => i.type !== "DRINK");
      const drinkItems = items.filter((i) => i.type === "DRINK");
      const prints = [];
      if (foodItems.length > 0) {
        prints.push(
          ...enqueueJobsForType("KITCHEN", {
            title: "PHIẾU BẾP",
            subtitle: "ĐỒ ĂN",
            tableNum: table_num,
            timeLabel: "Giờ",
            timeValue: nowText,
            items: foodItems,
            footer: "Giao bếp",
            hidePrices: true,
          })
        );
      }
      if (drinkItems.length > 0) {
        prints.push(
          ...enqueueJobsForType("BILL", {
            title: "PHIẾU PHA CHẾ",
            subtitle: "NƯỚC",
            tableNum: table_num,
            timeLabel: "Giờ",
            timeValue: nowText,
            items: drinkItems,
            footer: "Pha chế",
            hidePrices: true,
          })
        );
      }
      return { status: 200, body: { success: true, prints, queued: prints.length } };
    }

    if (action === "tamtinh") {
      const { table_num, items = [], total } = body;
      if (!Array.isArray(items) || items.length === 0) {
        return { status: 400, body: { error: "Danh sách món không hợp lệ" } };
      }
      const store = getStoreProfile();
      const prints = enqueueJobsForType("TAMTINH", {
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
      return { status: 200, body: { success: true, prints, queued: prints.length } };
    }

    if (action === "bill") {
      const {
        table_num,
        items = [],
        total,
        subtotal,
        discount_percent,
        discount_amount,
        tip_amount,
        cash_given,
        change_due,
      } = body;
      if (!Array.isArray(items) || items.length === 0) {
        return { status: 400, body: { error: "Danh sách món không hợp lệ" } };
      }
      const store = getStoreProfile();
      const prints = enqueueJobsForType("BILL", {
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
        tipAmount: tip_amount,
        cashGiven: cash_given,
        changeDue: change_due,
        billNo: "--",
        cashier: store.cashierName,
        footer: "",
        groupItemsByType: true,
      });
      return { status: 200, body: { success: true, prints, queued: prints.length } };
    }

    if (action === "bill_reprint") {
      const billId = Number(body.billId);
      if (!billId) return { status: 400, body: { error: "Thiếu billId" } };
      const bill = await mongoDb.collection("bills").findOne(mongoBillBySqliteId(billId));
      if (!bill) return { status: 404, body: { error: "Không tìm thấy hóa đơn" } };
      const items = await mongoDb
        .collection("bill_items")
        .find(mongoItemsByBillId(billId))
        .sort({ sqlite_id: 1 })
        .toArray();
      const store = getStoreProfile();
      const prints = enqueueJobsForType("BILL", {
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
      });
      return { status: 200, body: { success: true, prints, queued: prints.length } };
    }

    return { status: 400, body: { error: "action không hợp lệ" } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { handleRenderQueue };
