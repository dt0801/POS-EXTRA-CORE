async function loadPrintersCache(mongoDb) {
  const docs = await mongoDb.collection("windows_printers").find({}).toArray();
  return docs.map((d) => ({
    id: Number(d.sqlite_id ?? d.id ?? 0),
    name: d.name,
    type: d.type || "ALL",
    paper_size: Number(d.paper_size || 80),
    is_enabled: d.is_enabled !== undefined ? Number(d.is_enabled) : 1,
  }));
}

module.exports = { loadPrintersCache };
