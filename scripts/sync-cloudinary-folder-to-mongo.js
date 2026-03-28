/**
 * Ảnh đã có sẵn trên Cloudinary (folder posextra-menu) — khớp theo tên file với field `image`
 * trong Mongo và cập nhật thành secure_url (không upload lại).
 *
 * Dùng khi bạn đã kéo thả hàng loạt lên Cloudinary Media Library.
 *
 * Biến môi trường: giống backend (MONGO_URL, MONGO_DB_NAME, CLOUDINARY_*).
 *
 *   node scripts/sync-cloudinary-folder-to-mongo.js
 *   node scripts/sync-cloudinary-folder-to-mongo.js --dry-run
 */

const path = require("path");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cloudinary = require("cloudinary").v2;

const DRY = process.argv.includes("--dry-run");
const FOLDER_PREFIX = (process.env.CLOUDINARY_MENU_FOLDER || "posextra-menu").replace(/\/+$/, "");

function isAlreadyUrl(s) {
  return /^https?:\/\//i.test(String(s || "").trim());
}

/** Lấy mọi resource ảnh trong prefix (có phân trang). */
async function listAllImagesInFolder() {
  const all = [];
  let next_cursor;
  do {
    const res = await cloudinary.api.resources({
      type: "upload",
      resource_type: "image",
      prefix: FOLDER_PREFIX,
      max_results: 500,
      ...(next_cursor ? { next_cursor } : {}),
    });
    all.push(...(res.resources || []));
    next_cursor = res.next_cursor;
  } while (next_cursor);
  return all;
}

/**
 * Map: tên không đuôi (vd beef_steak_bbq_1774346497547) -> secure_url
 * Nếu trùng key, giữ bản ghi sau và in cảnh báo.
 */
function buildLookup(resources) {
  const byStem = new Map();
  const byFullName = new Map();

  for (const r of resources) {
    const url = String(r.secure_url || r.url || "").trim();
    if (!url) continue;

    const pid = String(r.public_id || "");
    const last = pid.includes("/") ? pid.slice(pid.lastIndexOf("/") + 1) : pid;
    const fmt = (r.format || "").toLowerCase();
    const stem = last;

    if (stem) {
      if (byStem.has(stem)) {
        console.warn(`[warn] trùng public_id stem "${stem}" — ghi đè URL mới hơn`);
      }
      byStem.set(stem, url);
    }

    if (fmt && stem) {
      const fakeBase = `${stem}.${fmt}`;
      byFullName.set(fakeBase.toLowerCase(), url);
    }

    const orig = r.original_filename;
    if (orig && typeof orig === "string") {
      const base = path.basename(orig);
      byFullName.set(base.toLowerCase(), url);
    }
  }

  return { byStem, byFullName };
}

function resolveUrl(imageField, lookup) {
  const base = path.basename(String(imageField || "").trim());
  if (!base || base === "." || base === "..") return null;

  const lower = base.toLowerCase();
  if (lookup.byFullName.has(lower)) return lookup.byFullName.get(lower);

  const stem = path.parse(base).name;
  if (lookup.byStem.has(stem)) return lookup.byStem.get(stem);

  return null;
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

  console.log(`Đang đọc ảnh trong Cloudinary prefix: "${FOLDER_PREFIX}/" ...`);
  const resources = await listAllImagesInFolder();
  console.log(`Tìm thấy ${resources.length} ảnh trên Cloudinary.`);

  const lookup = buildLookup(resources);
  if (DRY) console.log("(dry-run — không ghi MongoDB)\n");

  const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  });
  await client.connect();
  const col = client.db(dbName).collection("menu");

  const docs = await col.find({}).sort({ sqlite_id: 1 }).toArray();
  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const doc of docs) {
    const id = doc.sqlite_id ?? doc.id;
    const image = doc.image || "";
    if (!image) {
      skipped++;
      continue;
    }
    if (isAlreadyUrl(image)) {
      skipped++;
      continue;
    }

    const url = resolveUrl(image, lookup);
    if (!url) {
      console.warn(`[không khớp] sqlite_id=${id} image="${image}" — không có ảnh tương ứng trên Cloudinary`);
      notFound++;
      continue;
    }

    if (DRY) {
      console.log(`[dry-run] sqlite_id=${id} "${image}" → ${url}`);
      updated++;
      continue;
    }

    await col.updateOne({ sqlite_id: Number(id) }, { $set: { image: url } });
    console.log(`[ok] sqlite_id=${id} → ${url}`);
    updated++;
  }

  await client.close();

  console.log("\n---");
  console.log(`Cập nhật Mongo: ${updated}, bỏ qua (rỗng/đã URL): ${skipped}, không khớp Cloudinary: ${notFound}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
