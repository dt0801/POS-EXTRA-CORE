import { post } from "./apiClient";

/**
 * HTML phiếu in — cùng pipeline server (receiptHtml → billHTMLServer) như lúc in thật.
 */
export async function fetchPrintPreviewHtml({ receipt, paper_size, css_override }) {
  const data = await post("/print/preview", {
    receipt,
    paper_size,
    css_override: css_override ?? undefined,
  });
  return data.html;
}
