async function getNextMongoId(mongoDb, collectionName) {
  const col = mongoDb.collection(collectionName);
  const docs = await col
    .find({})
    .project({ sqlite_id: 1, id: 1 })
    .sort({ sqlite_id: -1 })
    .limit(1)
    .toArray();
  const maxVal = docs[0]
    ? Number(docs[0].sqlite_id ?? docs[0].id ?? 0)
    : 0;
  return maxVal + 1;
}

module.exports = { getNextMongoId };
