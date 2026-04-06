/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 * @param {{ num: string, body: { status?: string } }} input
 * @returns {Promise<{ status: number, body: object }>}
 */
async function updateTableStatus(deps, input) {
  const { mongoDb } = deps;
  const { num } = input;
  const { status } = input.body || {};
  try {
    await mongoDb.collection("tables").updateOne(
      { table_num: Number(num) },
      { $set: { table_num: Number(num), status: status || "PAID" } },
      { upsert: true }
    );
    return { status: 200, body: { updated: true } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { updateTableStatus };
