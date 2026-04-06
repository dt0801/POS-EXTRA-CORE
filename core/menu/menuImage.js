const path = require("path");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;

function isCloudinaryConfigured() {
  const n = (process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const k = (process.env.CLOUDINARY_API_KEY || "").trim();
  const s = (process.env.CLOUDINARY_API_SECRET || "").trim();
  return Boolean(n && k && s);
}

function safeMenuImageFilename(originalName) {
  const original = String(originalName || "image");
  const ext = path.extname(original).toLowerCase() || ".jpg";
  const safeBase = path
    .basename(original, path.extname(original))
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
  const finalExt = ext && ext.length <= 10 ? ext : ".jpg";
  return `${Date.now()}-${safeBase}${finalExt}`;
}

async function persistMenuImage(uploadsDir, file) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) return "";
  if (isCloudinaryConfigured()) {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "posextra-menu", resource_type: "image" },
        (err, r) => (err ? reject(err) : resolve(r))
      );
      stream.end(file.buffer);
    });
    return String(result.secure_url || result.url || "").trim();
  }
  const name = safeMenuImageFilename(file.originalname);
  await fs.promises.writeFile(path.join(uploadsDir, name), file.buffer);
  return name;
}

module.exports = {
  isCloudinaryConfigured,
  safeMenuImageFilename,
  persistMenuImage,
};
