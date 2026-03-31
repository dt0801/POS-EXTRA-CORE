/**
 * Cầu nối in khi chạy trong Electron (UI local hoặc Vercel + API cloud).
 */

export function isPosElectron() {
  return (
    typeof window !== "undefined" &&
    window.posElectron &&
    typeof window.posElectron.printHtml === "function"
  );
}

export async function electronListPrinters() {
  const rows = await window.posElectron.listPrinters();
  return Array.isArray(rows) ? rows : [];
}

export async function electronPrintJobs(prints) {
  for (const p of prints) {
    await window.posElectron.printHtml(p.html, p.printerName, {
      paperSize: p.paperSize || 80,
    });
  }
}

/**
 * Gọi API render-queue (Mongo trên cloud) rồi in từng bản trên máy Windows qua IPC.
 */
export async function printViaElectronRemote(apiBase, endpoint, payload) {
  let body;
  const billRe = /^\/print\/bill\/(\d+)$/.exec(endpoint);
  if (billRe) {
    body = { action: "bill_reprint", billId: Number(billRe[1]) };
  } else {
    const actionMap = {
      "/print/kitchen": "kitchen",
      "/print/tamtinh": "tamtinh",
      "/print/bill": "bill",
    };
    const action = actionMap[endpoint];
    if (!action) {
      throw new Error(`Endpoint in không hỗ trợ qua Electron: ${endpoint}`);
    }
    body = { action, ...payload };
  }

  const res = await fetch(`${apiBase.replace(/\/+$/, "")}/print/render-queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Không tạo được hàng đợi in");
  }
  const prints = data.prints || [];
  if (prints.length === 0) {
    throw new Error(
      "Chưa có máy in phù hợp trong cài đặt (hoặc đã tắt). Kiểm tra Cấu hình → máy in."
    );
  }
  await electronPrintJobs(prints);
  return { success: true, queued: prints.length };
}
