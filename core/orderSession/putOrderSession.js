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
  const reductions = [];
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
        reductions.push({
          tableNum,
          itemId,
          itemName: previousItem?.name || "",
          itemPrice: Number(previousItem?.price || 0),
          previousQty,
          nextQty: Math.max(0, nextQty),
          reducedQty: previousQty - Math.max(0, nextQty),
        });
      }
    }
  }

  return reductions;
}

function itemMatchKey(item) {
  return String(item?.name || "").trim().toLowerCase();
}

async function isAllowedPaidReduction({ mongoDb, reductions, paymentReduction, actorUser }) {
  if (!reductions.length) return true;
  const billId = Number(paymentReduction?.bill_id || paymentReduction?.billId || 0);
  if (!billId) return false;

  const bill = await mongoDb.collection("bills").findOne({ sqlite_id: billId });
  if (!bill) return false;

  const actorId = actorUser?.id != null ? Number(actorUser.id) : null;
  if (actorId != null && bill.created_by != null && Number(bill.created_by) !== actorId) return false;

  const billTable = String(Number(bill.table_num));
  if (reductions.some((item) => String(Number(item.tableNum)) !== billTable)) return false;

  const billItems = await mongoDb.collection("bill_items").find({ bill_id: billId }).toArray();
  const paidQtyByKey = new Map();
  billItems.forEach((item) => {
    const key = itemMatchKey(item);
    paidQtyByKey.set(key, (paidQtyByKey.get(key) || 0) + Number(item.qty || 0));
  });

  for (const reduction of reductions) {
    const key = itemMatchKey({ name: reduction.itemName, price: reduction.itemPrice });
    const available = paidQtyByKey.get(key) || 0;
    if (available < reduction.reducedQty) return false;
    paidQtyByKey.set(key, available - reduction.reducedQty);
  }
  return true;
}

async function putOrderSession(deps, input) {
  const { mongoDb } = deps;
  const actorRole = String(input.actorUser?.role || "staff").toLowerCase();
  const { tableOrders = {}, itemNotes = {}, kitchenSent = {}, paymentReduction = null } = input.body || {};

  if (actorRole !== "admin") {
    const existing = await mongoDb.collection("order_session").findOne({ id: 1 });
    const previous = parseSessionPayload(existing);
    const reductions = findStaffDeletionOrReduction(previous.tableOrders, tableOrders);
    const allowedPaidReduction = await isAllowedPaidReduction({
      mongoDb,
      reductions,
      paymentReduction,
      actorUser: input.actorUser,
    });
    if (reductions.length && !allowedPaidReduction) {
      return {
        status: 403,
        body: {
          error: "Nhân viên không được giảm hoặc xóa món trong order. Vui lòng gọi admin.",
          blocked: reductions[0],
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
