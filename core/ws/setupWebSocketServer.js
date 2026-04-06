const { WebSocketServer } = require("ws");

function setupWebSocketServer({
  server,
  jwt,
  jwtSecret,
  printBridgeSecret,
  bridgeClients,
  addPosClient,
  removePosClient,
}) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    const rawUrl = req.url || "";
    const onlyPath = rawUrl.split("?")[0];
    if (onlyPath === "/pos") {
      try {
        const token = rawUrl.match(/[?&]token=([^&]+)/)?.[1];
        if (!token) {
          ws.close(1008, "Unauthorized");
          return;
        }
        const decoded = jwt.verify(decodeURIComponent(token), jwtSecret);
        ws.userId = Number(decoded.id || 0);
        ws.sessionId = String(decoded.session_id || "");
        if (!ws.userId || !ws.sessionId) {
          ws.close(1008, "Unauthorized");
          return;
        }
        addPosClient(ws.userId, ws);
        ws.on("close", () => removePosClient(ws.userId, ws));
        ws.on("error", () => removePosClient(ws.userId, ws));
        return;
      } catch {
        ws.close(1008, "Unauthorized");
        return;
      }
    }
    if (onlyPath !== "/bridge") {
      ws.close(1008, "Unknown path");
      return;
    }
    const secret = rawUrl.match(/[?&]secret=([^&]+)/)?.[1];
    if (secret !== printBridgeSecret) {
      ws.close(1008, "Unauthorized");
      return;
    }
    bridgeClients.add(ws);
    console.log(`✅ Print Bridge kết nối. Tổng: ${bridgeClients.size}`);
    ws.on("close", () => {
      bridgeClients.delete(ws);
      console.log(`⚠️  Print Bridge ngắt. Còn: ${bridgeClients.size}`);
    });
    ws.on("error", () => {
      bridgeClients.delete(ws);
    });
  });

  return wss;
}

module.exports = { setupWebSocketServer };
