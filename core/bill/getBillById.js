const { mongoBillBySqliteId, mongoItemsByBillId } = require("./mongoBillIds");

/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 * @param {{ id: string | number }} input
 */
async function getBillById(deps, input) {
  const { mongoDb } = deps;
  const billId = Number(input.id);
  try {
    const bill = await mongoDb.collection("bills").findOne(mongoBillBySqliteId(billId));
    if (!bill) return { status: 404, body: { error: "Not found" } };
    const items = await mongoDb
      .collection("bill_items")
      .find(mongoItemsByBillId(billId))
      .sort({ sqlite_id: 1 })
      .toArray();

    return {
      status: 200,
      body: {
        id: Number(bill.sqlite_id ?? bill.id ?? billId),
        table_num: Number(bill.table_num || 0),
        total: Number(bill.total || 0),
        subtotal: Number(bill.subtotal || 0),
        discount_percent: Number(bill.discount_percent || 0),
        discount_amount: Number(bill.discount_amount || 0),
        tip_amount: Number(bill.tip_amount || 0),
        cash_given: Number(bill.cash_given || 0),
        change_due: Number(bill.change_due || 0),
        payment_method: bill.payment_method || null,
        created_by: bill.created_by ?? null,
        created_by_username: bill.created_by_username ?? null,
        created_by_full_name: bill.created_by_full_name ?? null,
        created_at: bill.created_at || "",
        items: items.map((it) => ({
          id: Number(it.sqlite_id ?? it.id ?? 0),
          bill_id: Number(it.bill_id || 0),
          name: it.name || "",
          price: Number(it.price || 0),
          qty: Number(it.qty || 0),
          item_type: it.item_type ?? null,
        })),
      },
    };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { getBillById };
