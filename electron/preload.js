const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("posElectron", {
  listPrinters: () => ipcRenderer.invoke("pos:list-printers"),
  printHtml: (html, printerName, opts) =>
    ipcRenderer.invoke("pos:print-html", {
      html,
      printerName,
      paperSize: opts && opts.paperSize != null ? opts.paperSize : 80,
    }),
});
