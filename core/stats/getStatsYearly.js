/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 * @param {{ year: string }} input
 * @returns {Promise<{ status: number, body: object }>}
 */
async function getStatsYearly(deps, input) {
  const { mongoDb } = deps;
  const year = input.year || new Date().getFullYear().toString();
  try {
    const bills = await mongoDb
      .collection("bills")
      .find({ created_at: { $regex: `^${year}-` } })
      .sort({ created_at: 1 })
      .toArray();

    const monthMap = {};
    let revenue = 0;
    bills.forEach((b) => {
      const ym = (b.created_at || "").slice(0, 7);
      if (!ym) return;
      if (!monthMap[ym]) monthMap[ym] = { month: ym, bill_count: 0, revenue: 0 };
      monthMap[ym].bill_count += 1;
      monthMap[ym].revenue += Number(b.total || 0);
      revenue += Number(b.total || 0);
    });

    const months = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

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
        months,
        top_items: topItems,
      },
    };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { getStatsYearly };
