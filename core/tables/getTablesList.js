/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 * @returns {Promise<{ status: number, body: unknown }>}
 */
async function getTablesList(deps) {
  const { mongoDb } = deps;
  try {
    const docs = await mongoDb.collection("tables").find({}).sort({ table_num: 1 }).toArray();
    return {
      status: 200,
      body: docs.map((d) => ({
        table_num: Number(d.table_num),
        status: d.status || "PAID",
      })),
    };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { getTablesList };
