const { peekMenuListCache, setMenuListCache } = require("./menuListCache");

const CACHE_CONTROL = "private, max-age=60";

/**
 * @param {{ mongoDb: import("mongodb").Db, ttlMs: number }} deps
 * @returns {Promise<{ status: number, body: unknown, headers?: Record<string, string> }>}
 */
async function getMenuList(deps) {
  const { mongoDb, ttlMs } = deps;
  try {
    const now = Date.now();
    const cached = peekMenuListCache(ttlMs, now);
    if (cached) {
      return {
        status: 200,
        body: cached,
        headers: { "Cache-Control": CACHE_CONTROL },
      };
    }
    const docs = await mongoDb
      .collection("menu")
      .find({})
      .project({ sqlite_id: 1, name: 1, price: 1, type: 1, image: 1, kitchen_category: 1 })
      .sort({ sqlite_id: 1 })
      .toArray();
    const payload = docs.map((d) => {
      const type = d.type || "FOOD";
      const kitchen =
        type === "DRINK" ? d.kitchen_category || "" : d.kitchen_category || "MAIN";
      return {
        id: Number(d.sqlite_id ?? d.id ?? 0),
        name: d.name || "",
        price: Number(d.price || 0),
        type,
        image: d.image || "",
        kitchen_category: kitchen,
      };
    });
    setMenuListCache(payload, now);
    return {
      status: 200,
      body: payload,
      headers: { "Cache-Control": CACHE_CONTROL },
    };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { getMenuList };
