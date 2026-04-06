const { mongoBillBySqliteId, mongoItemsByBillId } = require("./mongoBillIds");
const { pdfExportBillPaperMm } = require("./pdfExportBillPaperMm");

/**
 * @param {{
 *   mongoDb: import("mongodb").Db,
 *   settingsCache: Record<string, unknown>,
 *   printersCache: unknown[],
 *   buildBillPdfBuffer: typeof import("../../server/pdf/buildBillPdfBuffer").buildBillPdfBuffer,
 *   renderBillPdf: typeof import("../../server/pdf/renderBillPdf").renderBillPdf,
 *   buildThermalPdfDocOptions: typeof import("../../server/pdf/renderBillPdf").buildThermalPdfDocOptions,
 *   getStoreProfile: () => { storeName: string, storeSubtitle: string, cashierName: string },
 * }} deps
 * @param {{ id: string, query: Record<string, unknown> }} input
 * @returns {Promise<
 *   | { kind: "error"; status: number; body: object }
 *   | { kind: "json"; status: number; body: object; headers?: Record<string, string> }
 *   | { kind: "pdf"; buffer: Buffer; headers: Record<string, string> }
 * >}
 */
async function getBillPdf(deps, input) {
  const {
    mongoDb,
    settingsCache,
    printersCache,
    buildBillPdfBuffer,
    renderBillPdf,
    buildThermalPdfDocOptions,
    getStoreProfile,
  } = deps;

  const billId = Number(input.id);
  if (!Number.isFinite(billId) || billId < 1) {
    return { kind: "error", status: 400, body: { error: "ID hóa đơn không hợp lệ" } };
  }

  const asBase64 =
    String(input.query.format || "").toLowerCase() === "base64" || input.query.base64 === "1";

  try {
    const bill = await mongoDb.collection("bills").findOne(mongoBillBySqliteId(billId));
    if (!bill) return { kind: "error", status: 404, body: { error: "Not found" } };
    const items = await mongoDb
      .collection("bill_items")
      .find(mongoItemsByBillId(billId))
      .sort({ sqlite_id: 1 })
      .toArray();

    const store = getStoreProfile();
    const payload = {
      storeName: store.storeName,
      billId: Number(bill.sqlite_id ?? bill.id ?? billId),
      tableNum: Number(bill.table_num || 0),
      createdAt: bill.created_at || "",
      total: Number(bill.total || 0),
      items: items.map((it) => ({
        name: it.name || "",
        price: Number(it.price || 0),
        qty: Number(it.qty || 0),
      })),
    };

    const paperMm = pdfExportBillPaperMm(printersCache, input.query.paper);

    let buf;
    try {
      buf = await buildBillPdfBuffer(
        { title: `Hóa đơn #${payload.billId}` },
        (doc) => renderBillPdf(doc, { ...payload, isReprint: false }, settingsCache, paperMm),
        buildThermalPdfDocOptions(paperMm)
      );
    } catch (pdfErr) {
      console.error("[pdf] buildBillPdfBuffer:", pdfErr && pdfErr.stack ? pdfErr.stack : pdfErr);
      return {
        kind: "error",
        status: 500,
        body: {
          error: "Không tạo được PDF",
          detail: String(pdfErr && pdfErr.message ? pdfErr.message : pdfErr),
        },
      };
    }

    if (asBase64) {
      return {
        kind: "json",
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
        body: {
          filename: `hoa-don-${payload.billId}.pdf`,
          mimeType: "application/pdf",
          data: buf.toString("base64"),
        },
      };
    }

    return {
      kind: "pdf",
      buffer: buf,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="hoa-don-${payload.billId}.pdf"`,
        "Content-Length": String(buf.length),
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    };
  } catch (e) {
    return { kind: "error", status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { getBillPdf };
