async function upsertSetting({ mongoDb, settingsCache }, { key, value }) {
  if (!key) return { status: 400, body: { error: "Missing key" } };
  try {
    await mongoDb.collection("settings").updateOne(
      { key },
      { $set: { key, value: value } },
      { upsert: true }
    );
    settingsCache[key] = value;
    return { status: 200, body: { success: true, key, value } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { upsertSetting };
