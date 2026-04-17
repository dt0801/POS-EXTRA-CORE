const { mongoBillBySqliteId, mongoItemsByBillId } = require("../bill/mongoBillIds");

async function handleRenderQueue(
  { mongoDb, enqueueJobsForType, getStoreProfile },
  body
) {
  const { action } = body || {};
  try {
    if (action === "kitchen") {
      const { table_num, items = [], language } = body;
      if (!Array.isArray(items) || items.length === 0) {
        return { status: 400, body: { error: "Danh sách món không hợp lệ" } };
      }
      const lang = String(language || "").toLowerCase() === "de" ? "de" : "vi";
      const locale = lang === "de" ? "de-DE" : "vi-VN";
      const nowText = new Date().toLocaleString(locale);
      const foodItems = items.filter((i) => i.type !== "DRINK");
      const drinkItems = items.filter((i) => i.type === "DRINK");
      const prints = [];
      const t = (vi, de) => (lang === "de" ? de : vi);
      if (foodItems.length > 0) {
        prints.push(
          ...enqueueJobsForType("KITCHEN", {
            language: lang,
            title: t("PHIẾU BẾP", "KÜCHENBON"),
            subtitle: t("ĐỒ ĂN", "ESSEN"),
            tableNum: table_num,
            timeLabel: t("Giờ", "Uhr"),
            timeValue: nowText,
            items: foodItems,
            footer: t("Giao bếp", "Küche"),
            hidePrices: true,
          })
        );
      }
      if (drinkItems.length > 0) {
        prints.push(
          ...enqueueJobsForType("BILL", {
            language: lang,
            title: t("PHIẾU PHA CHẾ", "GETRÄNKEBON"),
            subtitle: t("NƯỚC", "GETRÄNKE"),
            tableNum: table_num,
            timeLabel: t("Giờ", "Uhr"),
            timeValue: nowText,
            items: drinkItems,
            footer: t("Pha chế", "Bar"),
            hidePrices: true,
          })
        );
      }
      return { status: 200, body: { success: true, prints, queued: prints.length } };
    }

    if (action === "tamtinh") {
      const { table_num, items = [], total, language } = body;
      if (!Array.isArray(items) || items.length === 0) {
        return { status: 400, body: { error: "Danh sách món không hợp lệ" } };
      }
      const store = getStoreProfile();
      const lang = String(language || "").toLowerCase() === "de" ? "de" : "vi";
      const locale = lang === "de" ? "de-DE" : "vi-VN";
      const t = (vi, de) => (lang === "de" ? de : vi);
      const prints = enqueueJobsForType("TAMTINH", {
        language: lang,
        title: store.storeName || t("TẠM TÍNH", "ZWISCHENRECHNUNG"),
        tableNum: table_num,
        timeLabel: t("Giờ", "Uhr"),
        timeValue: new Date().toLocaleString(locale),
        items,
        totalLabel: t("TẠM TÍNH", "ZWISCHENSUMME"),
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
        cash_given,
        change_due,
        language,
      } = body;
      if (!Array.isArray(items) || items.length === 0) {
        return { status: 400, body: { error: "Danh sách món không hợp lệ" } };
      }
      const store = getStoreProfile();
      const lang = String(language || "").toLowerCase() === "de" ? "de" : "vi";
      const locale = lang === "de" ? "de-DE" : "vi-VN";
      const t = (vi, de) => (lang === "de" ? de : vi);
      const prints = enqueueJobsForType("BILL", {
        language: lang,
        title: store.storeName,
        subtitle: store.storeSubtitle,
        tableNum: table_num,
        timeLabel: t("Ngày", "Datum"),
        timeValue: new Date().toLocaleString(locale),
        items,
        totalLabel: t("THÀNH TIỀN", "GESAMT"),
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
      });
      return { status: 200, body: { success: true, prints, queued: prints.length } };
    }

    if (action === "bill_reprint") {
      const billId = Number(body.billId);
      const lang = String(body.language || "").toLowerCase() === "de" ? "de" : "vi";
      const locale = lang === "de" ? "de-DE" : "vi-VN";
      const t = (vi, de) => (lang === "de" ? de : vi);
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
        language: lang,
        title: store.storeName,
        subtitle: store.storeSubtitle,
        tableNum: Number(bill.table_num || 0),
        timeLabel: t("Ngày", "Datum"),
        timeValue: new Date(bill.created_at).toLocaleString(locale),
        items,
        totalLabel: t("THÀNH TIỀN", "GESAMT"),
        totalValue: Number(bill.total || 0),
        subtotalValue: Number(bill.subtotal || 0),
        discountPercent: Number(bill.discount_percent || 0),
        discountAmount: Number(bill.discount_amount || 0),
        cashGiven: Number(bill.cash_given || 0),
        changeDue: Number(bill.change_due || 0),
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
