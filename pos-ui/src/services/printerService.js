import { get, post } from "./apiClient";
import { electronListPrinters, isPosElectron } from "./electronPrint";

export function fetchPrinterStatus() {
  return get("/print/status");
}

export async function fetchWindowsPrinters() {
  if (isPosElectron()) {
    return electronListPrinters();
  }
  try {
    const configured = await get("/print/printers");
    if (Array.isArray(configured) && configured.length) {
      return configured
        .map((p) => ({ name: p.printer_name || p.name || "" }))
        .filter((p) => p.name);
    }
  } catch {
    // fallback HTTP API
  }
  return get("/printers");
}

export function fetchDbPrinters() {
  return get("/windows_printers");
}

export function addDbPrinter(payload) {
  return post("/windows_printers", payload);
}
