const { mapToLegacyPrinter } = require("./mapToLegacyPrinter");

async function legacyUpdatePrinter(
  { mongoDb, refreshPrintersCache, printersCache },
  { id, body }
) {
  try {
    const { printer_name, job_type, paper_width, is_active } = body || {};
    const setData = {};
    if (printer_name !== undefined) setData.name = String(printer_name || "").trim();
    if (job_type !== undefined) setData.type = String(job_type || "ALL").trim().toUpperCase();
    if (paper_width !== undefined) setData.paper_size = Number(paper_width) || 80;
    if (is_active !== undefined) setData.is_enabled = is_active ? 1 : 0;
    const result = await mongoDb.collection("windows_printers").updateOne(
      { sqlite_id: id },
      { $set: setData }
    );
    if (!result.matchedCount) return { status: 404, body: { error: "Không tìm thấy máy in" } };
    await refreshPrintersCache();
    const updated = printersCache.find((p) => Number(p.id) === id);
    return {
      status: 200,
      body: mapToLegacyPrinter(updated || { id, ...setData }),
    };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { legacyUpdatePrinter };
