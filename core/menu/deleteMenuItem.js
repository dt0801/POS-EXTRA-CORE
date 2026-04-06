const { invalidateMenuListCache } = require("./menuListCache");

/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 * @param {{ id: string | number }} input
 */
async function deleteMenuItem(deps, input) {
  const { mongoDb } = deps;
  try {
    const result = await mongoDb.collection("menu").deleteOne({ sqlite_id: Number(input.id) });
    if (result.deletedCount === 0) return { status: 404, body: { error: "Không tìm thấy món" } };
    invalidateMenuListCache();
    return { status: 200, body: { deleted: true, mongoSaved: true, mongoError: null } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { deleteMenuItem };
