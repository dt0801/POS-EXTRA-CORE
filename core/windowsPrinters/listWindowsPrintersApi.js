async function listWindowsPrintersApi({ mongoDb }) {
  try {
    const docs = await mongoDb.collection("windows_printers").find({}).sort({ sqlite_id: 1 }).toArray();
    return {
      status: 200,
      body: docs.map((d) => ({
        id: Number(d.sqlite_id ?? d.id ?? 0),
        name: d.name,
        type: d.type || "ALL",
        paper_size: Number(d.paper_size || 80),
        is_enabled: d.is_enabled !== undefined ? Number(d.is_enabled) : 1,
      })),
    };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { listWindowsPrintersApi };
