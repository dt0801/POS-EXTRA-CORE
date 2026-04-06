const fs = require("fs");
const path = require("path");

/**
 * Đường dẫn TTF/OTF để PDFKit hiển thị tiếng Việt.
 * Thứ tự: PDF_FONT_PATH → Windows Arial → Linux DejaVu.
 */
function resolveUnicodeFontPath() {
  const env = process.env.PDF_FONT_PATH && String(process.env.PDF_FONT_PATH).trim();
  if (env && fs.existsSync(env)) return env;

  if (process.platform === "win32") {
    const windir = process.env.WINDIR || "C:\\Windows";
    const arial = path.join(windir, "Fonts", "arial.ttf");
    if (fs.existsSync(arial)) return arial;
  }

  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/opentype/noto/NotoSans-Regular.ttf",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

module.exports = { resolveUnicodeFontPath };
