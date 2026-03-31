const DEFAULT_WS_URL = (process.env.REACT_APP_BRIDGE_WS_URL || "ws://127.0.0.1:3000").trim();
const DEFAULT_SECRET = (process.env.REACT_APP_BRIDGE_SECRET || "bbq-pos-bridge-secret-2024").trim();

let socket = null;
let connectPromise = null;
const pending = new Map();

function toMessage(input) {
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (input && typeof input === "object") return input;
  return null;
}

function resolvePending(message) {
  const candidates = [
    message?.requestId,
    message?.reqId,
    message?.id,
    message?.data?.requestId,
    message?.data?.reqId,
    message?.data?.id,
  ].filter(Boolean);

  for (const key of candidates) {
    const ticket = pending.get(String(key));
    if (ticket) {
      pending.delete(String(key));
      ticket.resolve(message);
      return true;
    }
  }
  return false;
}

function attachSocketHandlers(ws) {
  ws.onmessage = (event) => {
    const message = toMessage(event.data);
    if (!message) return;
    resolvePending(message);
  };
  ws.onclose = () => {
    socket = null;
    connectPromise = null;
    for (const [, ticket] of pending) {
      ticket.reject(new Error("Bridge đã ngắt kết nối"));
    }
    pending.clear();
  };
  ws.onerror = () => {
    // noop: connect/retry handled by caller timeout
  };
}

async function ensureBridgeConnected() {
  if (socket && socket.readyState === WebSocket.OPEN) return socket;
  if (connectPromise) return connectPromise;

  connectPromise = new Promise((resolve, reject) => {
    const ws = new WebSocket(DEFAULT_WS_URL);
    const t = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      reject(new Error("Không kết nối được PrintBridge (ws://127.0.0.1:3000)"));
    }, 2500);

    ws.onopen = () => {
      clearTimeout(t);
      socket = ws;
      attachSocketHandlers(ws);
      resolve(ws);
    };
    ws.onclose = () => {
      clearTimeout(t);
      if (socket === ws) socket = null;
    };
    ws.onerror = () => {};
  }).finally(() => {
    connectPromise = null;
  });

  return connectPromise;
}

function requestOnce(ws, payload, timeoutMs = 3500) {
  return new Promise((resolve, reject) => {
    const id = String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8);
    const enriched = { ...payload };
    if (!("requestId" in enriched)) enriched.requestId = id;
    if (!("id" in enriched)) enriched.id = id;

    const key = String(enriched.requestId || enriched.id || id);
    const timer = setTimeout(() => {
      pending.delete(key);
      reject(new Error("Bridge timeout"));
    }, timeoutMs);

    pending.set(key, {
      resolve: (message) => {
        clearTimeout(timer);
        resolve(message);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });

    try {
      ws.send(JSON.stringify(enriched));
    } catch (e) {
      clearTimeout(timer);
      pending.delete(key);
      reject(e);
    }
  });
}

async function requestBridge(variants) {
  const ws = await ensureBridgeConnected();
  let lastErr = null;
  for (const payload of variants) {
    try {
      return await requestOnce(ws, payload);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Bridge request thất bại");
}

function normalizePrinterRows(message) {
  const rows =
    message?.printers ||
    message?.data?.printers ||
    message?.items ||
    message?.data?.items ||
    message?.data ||
    [];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((p) => ({
      name: String(p?.name ?? p?.Name ?? "").trim(),
      port: String(p?.port ?? p?.PortName ?? "").trim(),
      status: String(p?.status ?? p?.PrinterStatus ?? "Unknown"),
    }))
    .filter((p) => p.name);
}

export async function bridgeListPrinters() {
  const variants = [
    { action: "list_printers", secret: DEFAULT_SECRET },
    { type: "list_printers", secret: DEFAULT_SECRET },
    { event: "list_printers", secret: DEFAULT_SECRET },
    { cmd: "list_printers", secret: DEFAULT_SECRET },
  ];
  const message = await requestBridge(variants);
  return normalizePrinterRows(message);
}

export async function bridgePrintHtml(html, printerName, paperSize = 80) {
  const variants = [
    {
      action: "print_html",
      secret: DEFAULT_SECRET,
      html,
      printerName,
      paperSize,
    },
    {
      type: "print",
      secret: DEFAULT_SECRET,
      payload: { html, printerName, paperSize },
    },
    {
      event: "print_html",
      secret: DEFAULT_SECRET,
      data: { html, printerName, paperSize },
    },
  ];
  return requestBridge(variants);
}

function buildRenderQueueBody(endpoint, payload) {
  const billRe = /^\/print\/bill\/(\d+)$/.exec(endpoint);
  if (billRe) {
    return { action: "bill_reprint", billId: Number(billRe[1]) };
  }
  const actionMap = {
    "/print/kitchen": "kitchen",
    "/print/tamtinh": "tamtinh",
    "/print/bill": "bill",
  };
  const action = actionMap[endpoint];
  if (!action) throw new Error(`Endpoint in không hỗ trợ qua bridge: ${endpoint}`);
  return { action, ...(payload || {}) };
}

export async function printViaBridgeRemote(apiBase, endpoint, payload) {
  const body = buildRenderQueueBody(endpoint, payload);
  const res = await fetch(`${apiBase.replace(/\/+$/, "")}/print/render-queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Không tạo được hàng đợi in");
  const prints = Array.isArray(data.prints) ? data.prints : [];
  if (!prints.length) {
    throw new Error("Chưa có máy in phù hợp trong cài đặt (hoặc đã tắt).");
  }
  for (const p of prints) {
    await bridgePrintHtml(p.html, p.printerName, p.paperSize || 80);
  }
  return { success: true, queued: prints.length };
}

export async function isBridgeReachable() {
  try {
    await ensureBridgeConnected();
    return true;
  } catch {
    return false;
  }
}
