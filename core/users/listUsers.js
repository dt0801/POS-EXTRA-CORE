/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 */
async function listUsers(deps) {
  const { mongoDb } = deps;
  try {
    const rows = await mongoDb
      .collection("users")
      .find({})
      .sort({ sqlite_id: 1 })
      .project({
        _id: 0,
        id: "$sqlite_id",
        username: 1,
        role: 1,
        full_name: 1,
        is_active: 1,
        created_at: 1,
      })
      .toArray();
    return { status: 200, body: rows };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { listUsers };
