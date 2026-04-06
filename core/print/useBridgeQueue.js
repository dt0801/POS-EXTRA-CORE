function useBridgeQueue({ PRINT_DISPATCH_MODE, bridgeClients }) {
  if (PRINT_DISPATCH_MODE === "queue") return true;
  return bridgeClients.size > 0 && typeof global.printHtmlToDevice !== "function";
}

module.exports = { useBridgeQueue };
