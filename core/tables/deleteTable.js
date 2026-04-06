/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 * @param {{ num: number }} input
 * @returns {Promise<{ status: number, body: object }>}
 */
async function deleteTable(deps, input) {
  const { mongoDb } = deps;
  const { num } = input;
  try {
    const busy = await mongoDb.collection("tables").findOne({ table_num: num, status: "OPEN" });
    if (busy) return { status: 400, body: { error: "Bàn đang có khách, không thể xóa" } };
    const result = await mongoDb.collection("tables").deleteOne({ table_num: num });
    if (result.deletedCount === 0) return { status: 404, body: { error: "Không tìm thấy bàn" } };
    return { status: 200, body: { deleted: true } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { deleteTable };
