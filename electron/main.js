/**
 * POS desktop:
 * - Mặc định: require server.js (Express + in ngầm global.printHtmlToDevice), mở http://127.0.0.1:3000
 * - Tùy chọn: ELECTRON_REMOTE_UI_URL=https://... → chỉ mở UI cloud, in qua IPC (API vẫn từ REACT_APP trong bundle)
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const http = require("http");
const { createPrintHtmlToDevice, silentPrintJob } = require("./printHtmlDevice");
const { listWindowsPrinters } = require(path.join(__dirname, "..", "server", "printing", "windowsPrinter"));

let mainWindow = null;

const remoteUrl = (process.env.ELECTRON_REMOTE_UI_URL || "").trim();

function waitForServer(port, host, maxAttempts = 80) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryOnce = () => {
      const req = http.get(`http://${host}:${port}/menu`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        attempts += 1;
        if (attempts >= maxAttempts) {
          reject(new Error(`Không kết nối được server tại ${host}:${port}`));
        } else {
          setTimeout(tryOnce, 250);
        }
      });
      req.setTimeout(3000, () => {
        req.destroy();
        attempts += 1;
        if (attempts >= maxAttempts) {
          reject(new Error(`Timeout chờ server ${host}:${port}`));
        } else {
          setTimeout(tryOnce, 250);
        }
      });
    };
    tryOnce();
  });
}

ipcMain.handle("pos:list-printers", async () => {
  try {
    return await listWindowsPrinters();
  } catch (e) {
    console.error("pos:list-printers", e);
    return [];
  }
});

ipcMain.handle("pos:print-html", async (_e, { html, printerName, paperSize }) => {
  await silentPrintJob(html, printerName, { paperSize });
  return { ok: true };
});

app.whenReady().then(async () => {
  console.log(
    remoteUrl
      ? `POS Electron: UI từ ${remoteUrl} — API theo REACT_APP trong bundle (Render/Vercel).`
      : "POS Electron: Express chạy trong process này — không mở thêm `npm run server` trùng cổng 3000."
  );
  process.env.ELECTRON_RUN = "1";

  const printFn = createPrintHtmlToDevice();
  global.printHtmlToDevice = printFn;

  global.openLogWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  };

  if (!remoteUrl) {
    require(path.join(__dirname, "..", "server.js"));
  }

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    if (remoteUrl) {
      await mainWindow.loadURL(remoteUrl);
    } else {
      await waitForServer(3000, "127.0.0.1");
      await mainWindow.loadURL("http://127.0.0.1:3000");
    }
  } catch (e) {
    console.error(e.message || e);
    mainWindow.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<body style="font-family:sans-serif;padding:24px"><h2>Không mở được POS</h2><p>${String(
            e.message || e
          )}</p><p>${
            remoteUrl
              ? "Kiểm tra URL và mạng."
              : "Kiểm tra MongoDB (.env) và cổng 3000."
          }</p></body>`
        )
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
