const { WebSocket } = require("ws");

function createPosClientRegistry() {
  const posClients = new Map();

  function addPosClient(userId, ws) {
    const key = String(userId);
    if (!posClients.has(key)) posClients.set(key, new Set());
    posClients.get(key).add(ws);
  }

  function removePosClient(userId, ws) {
    const key = String(userId);
    const set = posClients.get(key);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) posClients.delete(key);
  }

  function notifyForceLogout(userId, reason = "Phiên đăng nhập đã được thay thế ở thiết bị khác") {
    const set = posClients.get(String(userId));
    if (!set) return;
    const payload = JSON.stringify({ event: "FORCE_LOGOUT", reason });
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  return { posClients, addPosClient, removePosClient, notifyForceLogout };
}

module.exports = { createPosClientRegistry };
