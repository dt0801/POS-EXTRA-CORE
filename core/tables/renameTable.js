/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 * @param {{ oldNum: number, body: { new_num?: unknown } }} input
 * @returns {Promise<{ status: number, body: object }>}
 */
async function renameTable(deps, input) {
  const { mongoDb } = deps;
  const { oldNum, body } = input;
  const { new_num } = body || {};
  if (!new_num) return { status: 400, body: { error: "Thiếu số bàn mới" } };

  try {
    const existing = await mongoDb.collection("tables").findOne({ table_num: Number(new_num) });
    if (existing) return { status: 409, body: { error: `Bàn ${new_num} đã tồn tại` } };

    const result = await mongoDb.collection("tables").updateMany(
      { table_num: oldNum },
      { $set: { table_num: Number(new_num) } }
    );

    if (result.matchedCount === 0) return { status: 404, body: { error: "Không tìm thấy bàn" } };
    return { status: 200, body: { updated: true } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { renameTable };
