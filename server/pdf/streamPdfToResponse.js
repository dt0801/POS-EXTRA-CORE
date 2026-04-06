const PDFDocument = require("pdfkit");
const { resolveUnicodeFontPath } = require("./resolveUnicodeFont");

/**
 * Pipe PDFKit → Express response đúng vòng đời stream (tránh file 0KB / response kép).
 *
 * - Gọi draw(doc) đồng bộ; mọi await phải xong trước khi gọi hàm này.
 * - Không được res.send/res.json sau khi đã pipe.
 *
 * @param {import("express").Response} res
 * @param {{ filename?: string, title?: string }} opts
 * @param {(doc: InstanceType<typeof PDFDocument>) => void} draw
 */
function streamPdfToResponse(res, opts, draw) {
  const filename = (opts.filename || "document.pdf").replace(/["\r\n]/g, "_");
  const title = opts.title || filename;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({
    margin: 48,
    size: "A4",
    info: { Title: title },
    autoFirstPage: true,
  });

  let failed = false;

  const onFail = (err, logLabel = "error") => {
    if (failed) return;
    failed = true;
    console.error(`[pdf] ${logLabel}:`, err && err.stack ? err.stack : err);
    try {
      if (typeof doc.destroy === "function") doc.destroy(err);
    } catch (_) {
      /* ignore */
    }
    if (!res.headersSent) {
      res.status(500).json({ error: "Không tạo được PDF", detail: String(err && err.message ? err.message : err) });
    } else {
      res.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  };

  doc.on("error", (err) => onFail(err, "document error"));
  res.on("error", (err) => onFail(err, "response error"));

  doc.pipe(res);

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
      "[pdf] Không tìm thấy font Unicode (PDF_FONT_PATH / Arial / DejaVu). Chữ tiếng Việt có thể sai."
    );
  }

  try {
    draw(doc);
    doc.end();
  } catch (err) {
    onFail(err, "draw/end");
  }
}

module.exports = { streamPdfToResponse };
