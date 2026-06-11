function parseSessionPayload(row) {
  if (!row?.payload) return { tableOrders: {}, itemNotes: {}, kitchenSent: {} };
  try {
    const parsed = JSON.parse(row.payload);
    return {
      tableOrders: parsed?.tableOrders && typeof parsed.tableOrders === "object" ? parsed.tableOrders : {},
      itemNotes: parsed?.itemNotes && typeof parsed.itemNotes === "object" ? parsed.itemNotes : {},
      kitchenSent: parsed?.kitchenSent && typeof parsed.kitchenSent === "object" ? parsed.kitchenSent : {},
    };
  } catch {
    return { tableOrders: {}, itemNotes: {}, kitchenSent: {} };
  }
}

async function resetOrderSessionTable(deps, input) {
  const { mongoDb } = deps;
  const tableNumber = Number(input.num);
  if (!Number.isInteger(tableNumber) || tableNumber <= 0) {
    return { status: 400, body: { error: "So ban khong hop le" } };
  }

  try {
    const existing = await mongoDb.collection("order_session").findOne({ id: 1 });
    const session = parseSessionPayload(existing);
    const tableKey = String(tableNumber);
    delete session.tableOrders[tableKey];
    delete session.itemNotes[tableKey];
    delete session.kitchenSent[tableKey];

    await Promise.all([
      mongoDb.collection("order_session").updateOne(
        { id: 1 },
        {
          $set: {
            id: 1,
            payload: JSON.stringify(session),
            updated_at: new Date().toISOString(),
          },
        },
        { upsert: true }
      ),
      mongoDb.collection("tables").updateOne(
        { table_num: tableNumber },
        { $set: { table_num: tableNumber, status: "PAID" } },
        { upsert: true }
      ),
    ]);

    return { status: 200, body: { ok: true, table_num: tableNumber } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { resetOrderSessionTable };
