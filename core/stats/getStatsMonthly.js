/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 * @param {{ month: string }} input
 * @returns {Promise<{ status: number, body: object }>}
 */
async function getStatsMonthly(deps, input) {
  const { mongoDb } = deps;
  const month = input.month || new Date().toISOString().slice(0, 7);
  try {
    const bills = await mongoDb
      .collection("bills")
      .find({ created_at: { $regex: `^${month}-` } })
      .sort({ created_at: 1 })
      .toArray();

    const dayMap = {};
    let revenue = 0;
    bills.forEach((b) => {
      const day = (b.created_at || "").slice(0, 10);
      if (!day) return;
      if (!dayMap[day]) dayMap[day] = { date: day, bill_count: 0, revenue: 0 };
      dayMap[day].bill_count += 1;
      dayMap[day].revenue += Number(b.total || 0);
      revenue += Number(b.total || 0);
    });

    const days = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));

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

    return {
      status: 200,
      body: {
        bill_count: bills.length,
        revenue,
        days,
        top_items: topItems,
      },
    };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { getStatsMonthly };
