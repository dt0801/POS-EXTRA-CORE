function postOpenLog() {
  if (typeof global.openLogWindow === "function") {
    global.openLogWindow();
    return { status: 200, body: { ok: true } };
  }
  return { status: 200, body: { ok: false, error: "Chỉ hoạt động trong Electron" } };
}

module.exports = { postOpenLog };
