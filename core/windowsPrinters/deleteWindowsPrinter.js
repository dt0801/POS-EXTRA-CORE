async function deleteWindowsPrinter({ mongoDb, refreshPrintersCache }, id) {
  try {
    const result = await mongoDb.collection("windows_printers").deleteOne({ sqlite_id: id });
    if (result.deletedCount === 0) return { status: 404, body: { error: "Không tìm thấy máy in" } };
    await refreshPrintersCache();
    return { status: 200, body: { success: true } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { deleteWindowsPrinter };
