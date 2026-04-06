async function seedMongoMenuIfEmpty({ mongoDb, mongoReady, menuSeedItems }) {
  if (!mongoReady) return;
  const col = mongoDb.collection("menu");
  const count = await col.countDocuments();
  if (count > 0) return;
  await col.insertMany(
    menuSeedItems.map((item, idx) => ({
      sqlite_id: idx + 1,
      name: item.name,
      price: Number(item.price),
      type: item.type,
      image: "",
    }))
  );
  console.log(`🌱 Mongo menu seed executed: ${menuSeedItems.length} món`);
}

module.exports = { seedMongoMenuIfEmpty };
