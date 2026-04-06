const path = require("path");
const fs = require("fs");

function getDebugUploads({ uploadsDir, baseDir }, query) {
  const file = String(query.file || "").trim();
  if (!file) return { status: 400, body: { error: "Missing ?file=" } };
  const fullPath = path.join(uploadsDir, file);
  return {
    status: 200,
    body: {
      file,
      exists: fs.existsSync(fullPath),
      uploadsDir,
      baseDir,
    },
  };
}

module.exports = { getDebugUploads };
