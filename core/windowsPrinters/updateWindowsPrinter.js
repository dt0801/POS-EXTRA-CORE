async function updateWindowsPrinter({ mongoDb, refreshPrintersCache }, { id, body }) {
  const { name, type, paper_size, is_enabled } = body || {};
  try {
    const result = await mongoDb.collection("windows_printers").updateOne(
      { sqlite_id: id },
      {
        $set: {
          name,
          type: type || "ALL",
          paper_size: Number(paper_size) || 80,
          is_enabled: is_enabled !== undefined ? Number(is_enabled) : 1,
        },
      }
    );
    if (result.matchedCount === 0) return { status: 404, body: { error: "Không tìm thấy máy in" } };
    await refreshPrintersCache();
    return { status: 200, body: { success: true } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { updateWindowsPrinter };
