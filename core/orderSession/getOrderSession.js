/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 */
async function getOrderSession(deps) {
  const { mongoDb } = deps;
  const row = await mongoDb.collection("order_session").findOne({ id: 1 });
  const empty = { tableOrders: {}, itemNotes: {}, kitchenSent: {} };
  if (!row?.payload) return { status: 200, body: empty };
  try {
    const p = JSON.parse(row.payload);
    return {
      status: 200,
      body: {
        tableOrders: p.tableOrders && typeof p.tableOrders === "object" ? p.tableOrders : {},
        itemNotes: p.itemNotes && typeof p.itemNotes === "object" ? p.itemNotes : {},
        kitchenSent: p.kitchenSent && typeof p.kitchenSent === "object" ? p.kitchenSent : {},
      },
    };
  } catch {
    return { status: 200, body: empty };
  }
}

module.exports = { getOrderSession };
