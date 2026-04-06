async function uploadStoreLogo(
  { mongoDb, settingsCache, persistMenuImage },
  file
) {
  if (!file) return { status: 400, body: { error: "Thiếu file logo" } };
  try {
    const saved = await persistMenuImage(file);
    const value = String(saved || "").trim();
    if (!value) return { status: 500, body: { error: "Không lưu được logo" } };
    await mongoDb.collection("settings").updateOne(
      { key: "store_logo" },
      { $set: { key: "store_logo", value } },
      { upsert: true }
    );
    settingsCache.store_logo = value;
    return { status: 200, body: { success: true, key: "store_logo", value } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { uploadStoreLogo };
