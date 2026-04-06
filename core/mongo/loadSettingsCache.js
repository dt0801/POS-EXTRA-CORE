async function loadSettingsCache(mongoDb) {
  const docs = await mongoDb.collection("settings").find({}).toArray();
  const next = {};
  docs.forEach((d) => {
    next[d.key] = d.value;
  });
  return next;
}

module.exports = { loadSettingsCache };
