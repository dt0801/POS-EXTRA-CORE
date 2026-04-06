const { WebSocket } = require("ws");

function broadcastToBridges(bridgeClients, payload) {
  const message = JSON.stringify(payload);
  for (const ws of bridgeClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

module.exports = { broadcastToBridges };
