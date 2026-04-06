/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 * @returns {Promise<{ status: number, body: object }>}
 */
async function getStatsToday(deps) {
  const { mongoDb } = deps;
  const today = new Date().toISOString().split("T")[0];
  try {
    const bills = await mongoDb.collection("bills").find({ created_at: { $regex: `^${today}` } }).toArray();

    const bill_count = bills.length;
    const revenue = bills.reduce((s, b) => s + Number(b.total || 0), 0);

    const billIds = bills.map((b) => Number(b.sqlite_id ?? b.id ?? 0)).filter(Boolean);
    let topItems = [];
    if (billIds.length) {
      const items = await mongoDb.collection("bill_items").find({ bill_id: { $in: billIds } }).toArray();

      const itemMap = {};
      items.forEach((it) => {
        const name = it.name || "";
        if (!itemMap[name]) itemMap[name] = { name, total_qty: 0, total_revenue: 0 };
        itemMap[name].total_qty += Number(it.qty || 0);
        itemMap[name].total_revenue += Number(it.price || 0) * Number(it.qty || 0);
      });
      topItems = Object.values(itemMap)
        .sort((a, b) => b.total_qty - a.total_qty)
        .slice(0, 5);
    }

    return { status: 200, body: { bill_count, revenue, top_items: topItems } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { getStatsToday };
