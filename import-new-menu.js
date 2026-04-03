const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Ưu tiên URI từ backend env (Mongo Atlas).
// Nếu không có env thì fallback local.
const MONGO_URI = (process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017').trim();
const DB_NAME = (process.env.MONGODB_DB || process.env.MONGO_DB_NAME || 'posextra').trim();
const COLLECTION_NAME = 'menu';

const MENU_FILE_PATH = path.join(__dirname, 'menu-export-1775196614743.json');

async function run() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const col = db.collection(COLLECTION_NAME);

    console.log('Đọc file menu JSON...');
    const raw = fs.readFileSync(MENU_FILE_PATH, 'utf8');
    const items = JSON.parse(raw);

    console.log(`Có tổng cộng ${items.length} món trong file JSON.`);

    const docs = items.map((item) => {
      const priceNumber = Number(item.price);

      return {
        id: item.id,
        sqlite_id: item.id,
        name: item.name,
        price: Number.isNaN(priceNumber) ? 0 : priceNumber,
        type: item.type,
        image: item.image || '',
      };
    });

    const beforeCount = await col.countDocuments({});
    console.log(`Collection "${DB_NAME}.${COLLECTION_NAME}" hiện có ${beforeCount} document.`);
    console.log('Xóa toàn bộ document cũ trong collection menu...');
    const deleteResult = await col.deleteMany({});
    console.log('Số document đã xóa:', deleteResult.deletedCount);

    console.log('Insert menu mới vào Mongo...');
    const insertResult = await col.insertMany(docs);
    console.log('Đã insert xong, insertedCount =', insertResult.insertedCount);
  } catch (err) {
    console.error('Lỗi khi import menu:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

run();

