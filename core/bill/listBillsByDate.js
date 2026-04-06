/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 * @param {{ date: string }} input
 */
async function listBillsByDate(deps, input) {
  const { mongoDb } = deps;
  const date = input.date || new Date().toISOString().split("T")[0];
  try {
    const bills = await mongoDb
      .collection("bills")
      .find({ created_at: { $regex: `^${date}` } })
      .sort({ created_at: -1 })
      .toArray();

    if (!bills.length) return { status: 200, body: [] };

    const billIds = bills.map((b) => Number(b.sqlite_id ?? b.id ?? 0)).filter(Boolean);
    const billIdKeys = [...new Set(billIds.flatMap((id) => [id, String(id)]))];
    const itemsDocs = await mongoDb
      .collection("bill_items")
      .find({ bill_id: { $in: billIdKeys } })
      .sort({ sqlite_id: 1 })
      .toArray();

    const map = {};
    itemsDocs.forEach((it) => {
      const bid = Number(it.bill_id);
      if (!map[bid]) map[bid] = [];
      map[bid].push(`${it.name || ""} x${Number(it.qty || 0)}`);
    });

    const rows = bills.map((b) => {
      const id = Number(b.sqlite_id ?? b.id ?? 0);
      return {
        id,
        table_num: Number(b.table_num || 0),
        total: Number(b.total || 0),
        created_at: b.created_at || "",
        items_summary: (map[id] || []).join(", "),
      };
    });

    return { status: 200, body: rows };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { listBillsByDate };
