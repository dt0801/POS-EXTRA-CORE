/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 * @param {{ body: object }} input
 */
function parseSessionPayload(row) {
  if (!row || !row.payload) return { tableOrders: {}, itemNotes: {}, kitchenSent: {} };
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

function findStaffDeletionOrReduction(previousOrders, nextOrders) {
  const prevTables = previousOrders && typeof previousOrders === "object" ? previousOrders : {};
  const nextTables = nextOrders && typeof nextOrders === "object" ? nextOrders : {};

  for (const [tableNum, previousTable] of Object.entries(prevTables)) {
    const nextTable = nextTables[tableNum] || {};
    for (const [itemId, previousItem] of Object.entries(previousTable || {})) {
      const previousQty = Number(previousItem?.qty || 0);
      if (previousQty <= 0) continue;
      const nextItem = nextTable[itemId];
      const nextQty = Number(nextItem?.qty || 0);
      if (!nextItem || nextQty < previousQty) {
        return {
          tableNum,
          itemId,
          itemName: previousItem?.name || "",
          previousQty,
          nextQty: Math.max(0, nextQty),
        };
      }
    }
  }

  return null;
}

async function putOrderSession(deps, input) {
  const { mongoDb } = deps;
  const actorRole = String(input.actorUser?.role || "staff").toLowerCase();
  const { tableOrders = {}, itemNotes = {}, kitchenSent = {} } = input.body || {};

  if (actorRole !== "admin") {
    const existing = await mongoDb.collection("order_session").findOne({ id: 1 });
    const previous = parseSessionPayload(existing);
    const blocked = findStaffDeletionOrReduction(previous.tableOrders, tableOrders);
    if (blocked) {
      return {
        status: 403,
        body: {
          error: "Nhân viên không được giảm hoặc xóa món trong order. Vui lòng gọi admin.",
          blocked,
        },
      };
    }
  }

  const payload = JSON.stringify({ tableOrders, itemNotes, kitchenSent });
  await mongoDb.collection("order_session").updateOne(
    { id: 1 },
    { $set: { id: 1, payload } },
    { upsert: true }
  );
  return { status: 200, body: { ok: true } };
}

module.exports = { putOrderSession };
