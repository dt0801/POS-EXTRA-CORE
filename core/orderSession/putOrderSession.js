/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 * @param {{ body: object }} input
 */
async function putOrderSession(deps, input) {
  const { mongoDb } = deps;
  const { tableOrders = {}, itemNotes = {}, kitchenSent = {} } = input.body || {};
  const payload = JSON.stringify({ tableOrders, itemNotes, kitchenSent });
  await mongoDb.collection("order_session").updateOne(
    { id: 1 },
    { $set: { id: 1, payload } },
    { upsert: true }
  );
  return { status: 200, body: { ok: true } };
}

module.exports = { putOrderSession };
