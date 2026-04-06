import React, { useEffect, useMemo, useState } from "react";
import { fetchPrintPreviewHtml } from "../../services/printPreviewApi";
import {
  receiptPayloadBillPreview,
  receiptPayloadKitchenPreview,
  receiptPayloadTamtinhPreview,
} from "../../utils/serverReceiptPayload";

export {
  PREVIEW_TABLE_NUM,
  SAMPLE_ITEMS_BILL,
  SAMPLE_ITEMS_KITCHEN,
  SAMPLE_TOTAL_BILL,
  buildKitchenPreviewSampleItems,
} from "./billPreviewSamples";

/** Khớp maxW trong billHTMLServer (58mm → 220px, 80mm → 320px). */
export function billPreviewFrameWidthPx(paperSizeMm) {
  return Number(paperSizeMm) === 58 ? 220 : 320;
}

/** Máy in bật đầu tiên khớp loại phiếu (hoặc ALL), mặc định 80mm. */
export function billPreviewPaperMm(billType, dbPrinters) {
  const map = { bill: "BILL", tamtinh: "TAMTINH", kitchen: "KITCHEN" };
  const want = map[billType] || "BILL";
  const list = (dbPrinters || []).filter(
    (p) => Number(p.is_enabled) !== 0 && (String(p.type || "").toUpperCase() === want || String(p.type || "").toUpperCase() === "ALL")
  );
  const ps = Number(list[0]?.paper_size);
  return ps === 58 ? 58 : 80;
}

export default function BillPreview({ settings, billType, titleHint, language = "vi", dbPrinters }) {
  const paperSizeMm = useMemo(() => billPreviewPaperMm(billType, dbPrinters), [billType, dbPrinters]);
  const frameW = billPreviewFrameWidthPx(paperSizeMm);
  const injectExtraCss = settings.bill_css_override || "";

  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const receipt =
      billType === "kitchen"
        ? receiptPayloadKitchenPreview({ settings, language })
        : billType === "tamtinh"
          ? receiptPayloadTamtinhPreview()
          : receiptPayloadBillPreview();

    fetchPrintPreviewHtml({
      receipt,
      paper_size: paperSizeMm,
      css_override: injectExtraCss,
    })
      .then((h) => {
        if (!cancelled) {
          setHtml(h);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || "Không tải được preview từ server");
          setHtml("");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [settings, billType, language, paperSizeMm, injectExtraCss]);

  return (
    <div className="w-full overflow-auto rounded-b-lg bg-white" style={{ maxHeight: "min(65vh, 560px)" }}>
      {loading && (
        <div className="flex items-center justify-center p-8 text-sm text-slate-500">Đang tải preview từ server…</div>
      )}
      {error && !loading && (
        <div className="p-4 text-sm text-red-600">{error}</div>
      )}
      {!loading && html && (
        <iframe
          title={titleHint ? `Preview — ${titleHint}` : "Bill preview"}
          sandbox="allow-same-origin"
          srcDoc={html}
          className="block w-full border-0 bg-white"
          style={{ width: frameW, minHeight: 420, height: 720 }}
        />
      )}
    </div>
  );
}
