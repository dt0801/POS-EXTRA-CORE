/**
 * POS desktop: Express chạy trong cùng process Node; gán global.printHtmlToDevice trước khi load server.
 */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const http = require("http");
const { createPrintHtmlToDevice } = require("./printHtmlDevice");

let mainWindow = null;

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

app.whenReady().then(async () => {
  console.log(
    "POS Electron: Express chạy trong process này — không mở thêm `npm run server` trùng cổng 3000."
  );
  process.env.ELECTRON_RUN = "1";

  global.printHtmlToDevice = createPrintHtmlToDevice();

  global.openLogWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  };

  require(path.join(__dirname, "..", "server.js"));

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    await waitForServer(3000, "127.0.0.1");
    await mainWindow.loadURL("http://127.0.0.1:3000");
  } catch (e) {
    console.error(e.message || e);
    mainWindow.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<body style="font-family:sans-serif;padding:24px"><h2>Không mở được POS</h2><p>${String(
            e.message || e
          )}</p><p>Kiểm tra MongoDB (.env) và cổng 3000.</p></body>`
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
