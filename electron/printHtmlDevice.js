/**
 * In HTML im lặng tới máy Windows qua Chromium (Electron), không qua dialog trình duyệt.
 */
const { BrowserWindow } = require("electron");

function createPrintHtmlToDevice() {
  let chain = Promise.resolve();

  return function printHtmlToDevice(html, deviceName, options = {}) {
    chain = chain
      .then(() => silentPrintJob(html, deviceName, options))
      .catch((err) => {
        console.error("🖨️ Lỗi in:", err.message || err);
      });
  };
}

function silentPrintJob(html, deviceName, options) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      width: 420,
      height: 900,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const safeName = String(deviceName || "").trim();
    const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(String(html || ""));

    win.webContents.once("did-fail-load", (_e, code, desc) => {
      if (!win.isDestroyed()) win.destroy();
      reject(new Error(desc || `Load failed (${code})`));
    });

    win
      .loadURL(dataUrl)
      .then(() => {
        win.webContents.print(
          {
            silent: true,
            printBackground: true,
            ...(safeName ? { deviceName: safeName } : {}),
          },
          (success, failureReason) => {
            if (!win.isDestroyed()) win.destroy();
            if (success) resolve();
            else reject(new Error(failureReason || "In thất bại"));
          }
        );
      })
      .catch((e) => {
        if (!win.isDestroyed()) win.destroy();
        reject(e);
      });
  });
}

module.exports = { createPrintHtmlToDevice };
