const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const http = require("http");

// ─── Single Instance Lock ─────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

let mainWindow = null;
let logWindow  = null;
let isQuitting = false;

// ─── Log system ───────────────────────────────────────────────────
const logs = [];

function log(level, ...args) {
  const time = new Date().toLocaleTimeString("vi-VN");
  const msg  = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  const entry = { time, level, msg };
  logs.push(entry);
  if (logs.length > 500) logs.shift();
  if (level === "ERROR") process.stderr.write(`[${level}] ${time} ${msg}\n`);
  else process.stdout.write(`[${level}] ${time} ${msg}\n`);
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.webContents.send("log", entry);
  }
}

// Override console để bắt log từ server.js
const _log = console.log.bind(console);
const _err = console.error.bind(console);
const _warn = console.warn.bind(console);
console.log   = (...a) => { _log(...a);  log("INFO",  ...a); };
console.error = (...a) => { _err(...a);  log("ERROR", ...a); };
console.warn  = (...a) => { _warn(...a); log("WARN",  ...a); };

// ─── Log Window ───────────────────────────────────────────────────
function openLogWindow() {
  if (logWindow && !logWindow.isDestroyed()) { logWindow.focus(); return; }

  logWindow = new BrowserWindow({
    width: 950, height: 600,
    title: "BBQ POS – Log",
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Log</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f172a;color:#e2e8f0;font-family:monospace;font-size:12px;display:flex;flex-direction:column;height:100vh}
#tb{background:#1e293b;padding:8px 12px;display:flex;gap:8px;align-items:center;border-bottom:1px solid #334155;flex-shrink:0}
#tb button{padding:4px 12px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:600}
#bc{background:#ef4444;color:white}
#bcp{background:#3b82f6;color:white}
#bf{background:#0f172a;color:#e2e8f0;border:1px solid #475569;border-radius:6px;padding:4px 8px;font-size:12px;flex:1}
#cnt{color:#94a3b8;font-size:11px;margin-left:auto;white-space:nowrap}
#lb{flex:1;overflow-y:auto;padding:8px 12px}
.e{padding:2px 0;border-bottom:1px solid #1e293b;display:flex;gap:8px;line-height:1.5}
.t{color:#475569;flex-shrink:0;width:70px}
.lI{color:#22d3ee;flex-shrink:0;width:42px}
.lE{color:#f87171;flex-shrink:0;width:42px}
.lW{color:#fbbf24;flex-shrink:0;width:42px}
.m{word-break:break-all}
.mE{color:#fca5a5}
</style></head><body>
<div id="tb">
  <span style="color:#94a3b8;font-weight:bold">📋 BBQ POS Log</span>
  <input id="bf" placeholder="🔍 Tìm kiếm..." oninput="fil()"/>
  <button id="bc" onclick="clr()">🗑 Xóa</button>
  <button id="bcp" onclick="cpy()">📋 Copy</button>
  <span id="cnt">0 dòng</span>
</div>
<div id="lb"></div>
<script>
const {ipcRenderer}=require("electron");
let all=[],ft="";
function ren(){
  const f=ft?all.filter(e=>(e.msg+e.level+e.time).toLowerCase().includes(ft)):all;
  document.getElementById("cnt").textContent=f.length+" dòng";
  document.getElementById("lb").innerHTML=f.map(e=>\`<div class="e">
    <span class="t">\${e.time}</span>
    <span class="l\${e.level[0]}">\${e.level}</span>
    <span class="m \${e.level==="ERROR"?"mE":""}">\${e.msg.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</span>
  </div>\`).join("");
  const b=document.getElementById("lb");
  b.scrollTop=b.scrollHeight;
}
function fil(){ft=document.getElementById("bf").value.toLowerCase();ren();}
function clr(){all=[];ren();}
function cpy(){
  navigator.clipboard.writeText(all.map(e=>"["+e.level+"] "+e.time+" "+e.msg).join("\\n"))
    .then(()=>{document.getElementById("bcp").textContent="✅ Đã copy!";
    setTimeout(()=>document.getElementById("bcp").textContent="📋 Copy",2000);});
}
ipcRenderer.on("log",(_,e)=>{all.push(e);if(all.length>500)all.shift();ren();});
ipcRenderer.on("log-history",(_,h)=>{all=h;ren();});
</script></body></html>`;

  logWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  logWindow.webContents.once("did-finish-load", () => {
    logWindow.webContents.send("log-history", logs);
  });
  logWindow.on("closed", () => { logWindow = null; });
}

ipcMain.on("open-log", () => openLogWindow());
// Expose cho server.js gọi qua global
global.openLogWindow = openLogWindow;

global.printHtmlToDevice = (html, deviceName, options = {}) => {
  const printWin = new BrowserWindow({ show: false });
  const paperSize = Number(options.paperSize) || 80;
  const pageSize =
    paperSize === 58
      ? { width: 58000, height: 200000 }
      : { width: 80000, height: 200000 };
  printWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  printWin.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      try {
        printWin.webContents.print({
          silent: true,
          deviceName: deviceName,
          printBackground: true,
          pageSize,
          margins: { marginType: "none" },
        });
      } catch(e) {
        log("ERROR", "Lỗi gửi lệnh in silent: " + e.message);
      }
      setTimeout(() => { if (!printWin.isDestroyed()) printWin.close(); }, 5000);
    }, 500);
  });
};

// ─── Server startup ───────────────────────────────────────────────
function startServer() {
  try {
    process.env.ELECTRON_RESOURCES_PATH = process.resourcesPath || __dirname;
    process.env.ELECTRON_USER_DATA      = app.getPath("userData");
    process.env.ELECTRON_APP_PATH       = __dirname;
    require(path.join(__dirname, "server.js"));
    log("INFO", "Server loaded OK");
  } catch (err) {
    log("ERROR", "Khong load duoc server: " + err.message);
  }
}

// ─── Wait for server ──────────────────────────────────────────────
function waitForServer(url, retries = 30, interval = 1000) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const check = () => {
      http.get(url, () => resolve()).on("error", () => {
        if (++n >= retries) reject(new Error("Server timeout"));
        else setTimeout(check, interval);
      });
    };
    check();
  });
}

// ─── Main Window ─────────────────────────────────────────────────
function createWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 700,
    show: false, autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    title: "BBQ POS – Tiem Nuong Da Lat Va Em",
  });

  mainWindow.on("closed", () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank" || url === "") {
      return { action: "allow", overrideBrowserWindowOptions: {
        width: 600, height: 700, autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      }};
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (e, u) => {
    if (!u.startsWith("http://localhost:3000")) e.preventDefault();
  });

  mainWindow.loadURL("data:text/html;charset=utf-8,<!DOCTYPE html><html><head><meta charset=utf-8></head><body style='background:%230f172a;color:%2394a3b8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;font-size:18px;margin:0'>Dang khoi dong...</body></html>");
  mainWindow.show();

  waitForServer("http://localhost:3000")
    .then(() => {
      log("INFO", "UI ready");
      if (mainWindow) mainWindow.loadURL("http://localhost:3000");
    })
    .catch((err) => {
      log("ERROR", "Server timeout: " + err.message);
      openLogWindow();
      if (mainWindow) mainWindow.loadURL(
        "data:text/html;charset=utf-8,<!DOCTYPE html><html><head><meta charset=utf-8></head><body style='background:%230f172a;color:%23ef4444;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-size:16px;margin:0;gap:12px;text-align:center'>Khong the khoi dong server.<br><span style=font-size:13px;color:%2394a3b8>Xem cua so Log de biet loi</span></body></html>"
      );
    });
}

// ─── Lifecycle ────────────────────────────────────────────────────
app.whenReady().then(() => {
  log("INFO", "BBQ POS starting...");
  startServer();
  createWindow();
});

app.on("second-instance", () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (!mainWindow) createWindow(); });
app.on("before-quit", () => { isQuitting = true; });