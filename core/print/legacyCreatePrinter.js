const { mapToLegacyPrinter } = require("./mapToLegacyPrinter");

async function legacyCreatePrinter(
  { mongoDb, getNextMongoId, refreshPrintersCache, printersCache },
  body
) {
  try {
    const { printer_name, job_type, paper_width } = body || {};
    if (!printer_name || !job_type) {
      return { status: 400, body: { error: "Thiếu printer_name hoặc job_type" } };
    }
    const nextId = await getNextMongoId("windows_printers");
    await mongoDb.collection("windows_printers").insertOne({
      sqlite_id: nextId,
      name: String(printer_name).trim(),
      type: String(job_type).trim().toUpperCase() || "ALL",
      paper_size: Number(paper_width) || 80,
      is_enabled: 1,
      created_at: new Date().toISOString(),
    });
    await refreshPrintersCache();
    const created = printersCache.find((p) => Number(p.id) === nextId);
    return {
      status: 200,
      body: mapToLegacyPrinter(
        created || {
          id: nextId,
          name: printer_name,
          type: job_type,
          paper_size: paper_width,
          is_enabled: 1,
        }
      ),
    };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { legacyCreatePrinter };
