import { get, post } from "./apiClient";
import { electronListPrinters, isPosElectron } from "./electronPrint";
import { bridgeListPrinters } from "./bridgeWs";

export function fetchPrinterStatus() {
  return get("/print/status");
}

export async function fetchWindowsPrinters() {
  if (isPosElectron()) {
    return electronListPrinters();
  }
  try {
    const viaBridge = await bridgeListPrinters();
    if (viaBridge.length) return viaBridge;
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
