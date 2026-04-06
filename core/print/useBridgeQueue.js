function useBridgeQueue({ PRINT_DISPATCH_MODE, bridgeClients }) {
  // Nếu chạy ở máy quầy/Electron có hàm in HTML ngầm, ưu tiên in trực tiếp để khớp preview.
  if (typeof global.printHtmlToDevice === "function") return false;

  // Cloud/Server không có in ngầm: dùng queue.
  if (PRINT_DISPATCH_MODE === "queue") return true;

  // Nếu có Bridge kết nối và không có in ngầm, vẫn dùng queue để Bridge xử lý.
  return bridgeClients.size > 0;
}

module.exports = { useBridgeQueue };
