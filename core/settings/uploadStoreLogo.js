async function uploadStoreLogo(
  { mongoDb, settingsCache, persistMenuImage },
  { file, publicBaseUrl }
) {
  if (!file) return { status: 400, body: { error: "Thiếu file logo" } };
  try {
    const saved = await persistMenuImage(file);
    let value = String(saved || "").trim();
    if (!value) return { status: 500, body: { error: "Không lưu được logo" } };
    // Nếu lưu local (filename), convert sang URL tuyệt đối để in ngầm (data: URL) vẫn load được.
    if (!/^https?:\/\//i.test(value) && publicBaseUrl) {
      const base = String(publicBaseUrl).replace(/\/+$/, "");
      const name = value.replace(/^\/+/, "");
      value = `${base}/uploads/${name}`;
    }
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
