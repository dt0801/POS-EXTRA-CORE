const { PassThrough } = require("stream");
const PDFDocument = require("pdfkit");
const { resolveUnicodeFontPath } = require("./resolveUnicodeFont");

const MIN_PDF_BYTES = 100;

function applyUnicodeFont(doc) {
  const fontPath = resolveUnicodeFontPath();
  if (fontPath) {
    try {
      doc.registerFont("Body", fontPath);
      doc.font("Body");
    } catch (e) {
      console.warn("[pdf] registerFont failed, Helvetica:", e.message || e);
      doc.font("Helvetica");
    }
  } else {
    doc.font("Helvetica");
    console.warn("[pdf] Không có font Unicode — PDF_FONT_PATH / Arial / DejaVu.");
  }
}

/**
 * Tạo PDF đúng chuẩn PDFKit: pipe(PassThrough) → Buffer (tránh 0KB do chỉ gắn listener 'data').
 *
 * @param {{ title?: string }} meta
 * @param {(doc: InstanceType<typeof PDFDocument>) => void} draw — đồng bộ
 * @param {{ size?: string | [number, number], margin?: number | object, autoFirstPage?: boolean }} [docOpts] — tùy chọn PDFDocument (vd. khổ nhiệt)
 * @returns {Promise<Buffer>}
 */
function buildBillPdfBuffer(meta, draw, docOpts = {}) {
  const { size = "A4", margin = 48, autoFirstPage = true, info: _ignoreInfo, ...rest } = docOpts;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      ...rest,
      margin,
      size,
      autoFirstPage,
      info: { Title: String(meta.title || "document").slice(0, 200) },
    });

    const sink = new PassThrough();
    const chunks = [];
    let settled = false;

    const finish = (err, buf) => {
      if (settled) return;
      settled = true;
      if (err) {
        try {
          if (typeof doc.destroy === "function") doc.destroy();
        } catch (_) {
          /* ignore */
        }
        reject(err);
        return;
      }
      resolve(buf);
    };

    sink.on("data", (c) => {
      if (c && c.length) chunks.push(c);
    });
    sink.on("end", () => {
      const buf = Buffer.concat(chunks);
      if (buf.length < MIN_PDF_BYTES) {
        finish(new Error(`PDF quá nhỏ (${buf.length} bytes)`));
        return;
      }
      if (buf[0] !== 0x25 || buf[1] !== 0x50 || buf[2] !== 0x44 || buf[3] !== 0x46) {
        finish(new Error("Không phải file PDF hợp lệ (thiếu header %PDF)"));
        return;
      }
      finish(null, buf);
    });
    sink.on("error", (e) => finish(e));

    doc.on("error", (e) => finish(e));

    doc.pipe(sink);

    try {
      applyUnicodeFont(doc);
      draw(doc);
      doc.end();
    } catch (e) {
      try {
        if (typeof doc.destroy === "function") doc.destroy(e);
        else doc.end();
      } catch (_) {
        /* ignore */
      }
      finish(e);
    }
  });
}

module.exports = { buildBillPdfBuffer, MIN_PDF_BYTES };
