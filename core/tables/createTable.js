/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 * @param {{ body: { table_num?: unknown } }} input
 * @returns {Promise<{ status: number, body: object }>}
 */
async function createTable(deps, input) {
  const { mongoDb } = deps;
  const { table_num } = input.body || {};
  if (!table_num) return { status: 400, body: { error: "Thiếu số bàn" } };

  try {
    const existing = await mongoDb.collection("tables").findOne({ table_num: Number(table_num) });
    if (existing) return { status: 409, body: { error: "Bàn đã tồn tại" } };
    await mongoDb.collection("tables").insertOne({ table_num: Number(table_num), status: "PAID" });
    return { status: 200, body: { added: true, table_num: Number(table_num) } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { createTable };
