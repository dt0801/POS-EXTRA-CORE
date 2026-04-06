async function legacyDeletePrinter({ mongoDb, refreshPrintersCache }, id) {
  try {
    await mongoDb.collection("windows_printers").deleteOne({ sqlite_id: id });
    await refreshPrintersCache();
    return { status: 200, body: { deleted: true } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { legacyDeletePrinter };
