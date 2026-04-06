const { MongoClient, ServerApiVersion } = require("mongodb");

/**
 * Kết nối Mongo theo biến môi trường. Trả về { ok, client, db } — không set biến global.
 */
async function connectMongoFromEnv() {
  const uri = (process.env.MONGODB_URI || process.env.MONGO_URL || "").trim();
  if (!uri) {
    console.log("ℹ️  Chưa cấu hình MONGODB_URI/MONGO_URL (Mongo-only).");
    return { ok: false, client: null, db: null };
  }
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  await client.connect();
  const dbName = (process.env.MONGODB_DB || process.env.MONGO_DB_NAME || "posextra").trim();
  const db = client.db(dbName);
  console.log(`✅ MongoDB connected: ${dbName}`);
  return { ok: true, client, db };
}

module.exports = { connectMongoFromEnv };
