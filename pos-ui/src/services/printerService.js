import { get, post } from "./apiClient";
import { electronListPrinters, isPosElectron } from "./electronPrint";

export function fetchPrinterStatus() {
  return get("/print/status");
}

export async function fetchWindowsPrinters() {
  if (isPosElectron()) {
    return electronListPrinters();
  }
  return get("/printers");
}

export function fetchDbPrinters() {
  return get("/windows_printers");
}

export function addDbPrinter(payload) {
  return post("/windows_printers", payload);
}
