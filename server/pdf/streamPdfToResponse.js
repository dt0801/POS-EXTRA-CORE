const PDFDocument = require("pdfkit");
const { resolveUnicodeFontPath } = require("./resolveUnicodeFont");

const MIN_PDF_BYTES = 64;

/**
 * Tạo PDF bằng PDFKit, gom buffer rồi gửi một lần — tránh file 0KB do pipe/proxy/ngắt stream sớm.
 *
 * @param {import("express").Response} res
 * @param {{ filename?: string, title?: string }} opts
 * @param {(doc: InstanceType<typeof PDFDocument>) => void} draw — đồng bộ
 */
function streamPdfToResponse(res, opts, draw) {
  const filename = (opts.filename || "document.pdf").replace(/["\r\n]/g, "_");
  const title = opts.title || filename;

  const doc = new PDFDocument({
    margin: 48,
    size: "A4",
    info: { Title: title },
    autoFirstPage: true,
  });

  const chunks = [];
  let failed = false;

  const fail = (err, label = "error") => {
    if (failed) return;
    failed = true;
    console.error(`[pdf] ${label}:`, err && err.stack ? err.stack : err);
    try {
      if (typeof doc.destroy === "function") doc.destroy(err);
    } catch (_) {
      /* ignore */
    }
    if (!res.headersSent) {
      res.status(500).json({
        error: "Không tạo được PDF",
        detail: String(err && err.message ? err.message : err),
      });
    }
  };

  doc.on("error", (err) => fail(err, "document error"));
  doc.on("data", (chunk) => {
    if (!failed && chunk && chunk.length) chunks.push(chunk);
  });
  doc.on("end", () => {
    if (failed) return;
    const buf = Buffer.concat(chunks);
    if (buf.length < MIN_PDF_BYTES) {
      console.error(`[pdf] output quá nhỏ: ${buf.length} bytes`);
      if (!res.headersSent) {
        res.status(500).json({ error: "PDF rỗng hoặc không hợp lệ" });
      }
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buf.length));
    res.send(buf);
  });

  const fontPath = resolveUnicodeFontPath();
  if (fontPath) {
    try {
      doc.registerFont("Body", fontPath);
      doc.font("Body");
    } catch (e) {
      console.warn("[pdf] registerFont failed, fallback Helvetica:", e.message || e);
      doc.font("Helvetica");
    }
  } else {
    doc.font("Helvetica");
    console.warn(
      "[pdf] Không tìm thấy font Unicode (PDF_FONT_PATH / Arial / DejaVu). Chữ tiếng Việt có thể lỗi."
    );
  }

  try {
    draw(doc);
    doc.end();
  } catch (err) {
    fail(err, "draw/end");
  }
}

module.exports = { streamPdfToResponse };
