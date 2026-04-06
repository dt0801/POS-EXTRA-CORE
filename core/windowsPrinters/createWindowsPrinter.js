async function createWindowsPrinter({ mongoDb, getNextMongoId, refreshPrintersCache }, body) {
  const { name, type, paper_size, is_enabled } = body || {};
  if (!name) return { status: 400, body: { error: "Thiếu tên máy in" } };
  try {
    const nextId = await getNextMongoId("windows_printers");
    await mongoDb.collection("windows_printers").insertOne({
      sqlite_id: nextId,
      name,
      type: type || "ALL",
      paper_size: Number(paper_size) || 80,
      is_enabled: is_enabled !== undefined ? Number(is_enabled) : 1,
    });
    await refreshPrintersCache();
    return { status: 200, body: { success: true } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { createWindowsPrinter };
