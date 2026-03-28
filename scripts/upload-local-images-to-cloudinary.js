/**
 * Đẩy ảnh menu từ thư mục local (uploads/) lên Cloudinary và cập nhật field `image` trong MongoDB.
 *
 * Cần biến môi trường giống backend:
 *   MONGODB_URI (hoặc MONGO_URL)
 *   MONGODB_DB (hoặc MONGO_DB_NAME), mặc định posextra
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 *
 * Tuỳ chọn:
 *   LOCAL_UPLOADS_DIR — thư mục chứa file ảnh (mặc định: ../uploads rồi ../data/uploads)
 *
 * Chạy (PowerShell):
 *   cd "D:\POS EXTRA"
 *   $env:MONGODB_URI="..."; $env:CLOUDINARY_CLOUD_NAME="..."; ...
 *   node scripts/upload-local-images-to-cloudinary.js
 *
 * Dry-run (chỉ in, không upload / không sửa DB):
 *   node scripts/upload-local-images-to-cloudinary.js --dry-run
 */

const path = require("path");
const fs = require("fs");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cloudinary = require("cloudinary").v2;

const ROOT = path.join(__dirname, "..");
const DRY = process.argv.includes("--dry-run");

const localUploadsDir = (process.env.LOCAL_UPLOADS_DIR || "").trim();

function candidateDirs() {
  const list = [];
  if (localUploadsDir) list.push(path.resolve(localUploadsDir));
  list.push(path.join(ROOT, "uploads"));
  list.push(path.join(ROOT, "data", "uploads"));
  return [...new Set(list)];
}

function findImageFile(imageField) {
  const name = path.basename(String(imageField || "").trim());
  if (!name || name === "." || name === "..") return null;
  for (const dir of candidateDirs()) {
    if (!fs.existsSync(dir)) continue;
    const full = path.join(dir, name);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

function isAlreadyCloudinaryUrl(s) {
  return /^https?:\/\//i.test(String(s || "").trim());
}

async function main() {
  const uri = (process.env.MONGODB_URI || process.env.MONGO_URL || "").trim();
  if (!uri) {
    console.error("Thiếu MONGODB_URI hoặc MONGO_URL");
    process.exit(1);
  }
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || "").trim();
  if (!cloudName || !apiKey || !apiSecret) {
    console.error("Thiếu CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET");
    process.exit(1);
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

  const dbName = (process.env.MONGODB_DB || process.env.MONGO_DB_NAME || "posextra").trim();

  console.log("Thư mục tìm ảnh:", candidateDirs().join(" | "));
  if (DRY) console.log("(dry-run — không ghi DB / không gọi Cloudinary upload thật)\n");

  const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  });
  await client.connect();
  const col = client.db(dbName).collection("menu");

  const docs = await col.find({}).sort({ sqlite_id: 1 }).toArray();
  let updated = 0;
  let skipped = 0;
  let missingFile = 0;

  for (const doc of docs) {
    const id = doc.sqlite_id ?? doc.id;
    const image = doc.image || "";
    if (!image) {
      skipped++;
      continue;
    }
    if (isAlreadyCloudinaryUrl(image)) {
      console.log(`[skip] sqlite_id=${id} đã là URL: ${image.slice(0, 60)}…`);
      skipped++;
      continue;
    }

    const filePath = findImageFile(image);
    if (!filePath) {
      console.warn(`[missing file] sqlite_id=${id} image="${image}" — không thấy file trong uploads`);
      missingFile++;
      continue;
    }

    if (DRY) {
      console.log(`[dry-run] sqlite_id=${id} → upload ${filePath}`);
      continue;
    }

    const result = await cloudinary.uploader.upload(filePath, {
      folder: "posextra-menu",
      resource_type: "image",
      use_filename: true,
      unique_filename: true,
    });
    const url = String(result.secure_url || result.url || "").trim();
    if (!url) {
      console.error(`[fail] sqlite_id=${id} Cloudinary không trả URL`);
      continue;
    }

    await col.updateOne({ sqlite_id: Number(id) }, { $set: { image: url } });
    console.log(`[ok] sqlite_id=${id} → ${url}`);
    updated++;
  }

  await client.close();

  console.log("\n---");
  console.log(`Cập nhật: ${updated}, bỏ qua (rỗng/đã URL): ${skipped}, thiếu file: ${missingFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
