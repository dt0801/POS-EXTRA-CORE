/**
 * @param {{ mongoDb: import("mongodb").Db }} deps
 * @param {{ month: string }} input
 * @returns {Promise<{ status: number, body: unknown }>}
 */
async function getStatsDaily(deps, input) {
  const { mongoDb } = deps;
  const month = input.month || new Date().toISOString().slice(0, 7);
  try {
    const bills = await mongoDb
      .collection("bills")
      .find({ created_at: { $regex: `^${month}-` } })
      .sort({ created_at: 1 })
      .toArray();

    const map = {};
    bills.forEach((b) => {
      const day = (b.created_at || "").slice(0, 10);
      if (!day) return;
      if (!map[day]) map[day] = { date: day, bill_count: 0, revenue: 0 };
      map[day].bill_count += 1;
      map[day].revenue += Number(b.total || 0);
    });

    const rows = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    return { status: 200, body: rows };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { getStatsDaily };
