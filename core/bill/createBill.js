/**
 * Tạo hóa đơn mới (logic gốc từ POST /bills).
 * @param {{ mongoDb: import("mongodb").Db, getNextMongoId: (name: string) => Promise<number> }} deps
 * @param {object} reqBody - req.body
 * @returns {Promise<{ status: number, body: object }>}
 */
async function createBill(deps, reqBody) {
  const { mongoDb, getNextMongoId } = deps;
  const { table_num, total, items } = reqBody || {};
  if (!table_num) return { status: 400, body: { error: "Thiếu table_num" } };
  if (!Array.isArray(items) || items.length === 0) {
    return { status: 400, body: { error: "Danh sách món không hợp lệ" } };
  }

  const now = new Date().toLocaleString("sv-SE").replace("T", " "); // "YYYY-MM-DD HH:MM:SS"
  try {
    const billId = await getNextMongoId("bills");
    await mongoDb.collection("bills").insertOne({
      sqlite_id: billId,
      table_num: Number(table_num),
      total: Number(total || 0),
      created_at: now,
    });

    const nextItemId = await getNextMongoId("bill_items");
    const billItems = items.map((item, idx) => ({
      sqlite_id: nextItemId + idx,
      bill_id: billId,
      name: item.name || "",
      price: Number(item.price || 0),
      qty: Number(item.qty || 0),
      item_type: item.type || null,
    }));
    if (billItems.length) {
      await mongoDb.collection("bill_items").insertMany(billItems);
    }

    await mongoDb.collection("tables").updateOne(
      { table_num: Number(table_num) },
      { $set: { table_num: Number(table_num), status: "PAID" } },
      { upsert: true }
    );

    return { status: 200, body: { bill_id: billId } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { createBill };
