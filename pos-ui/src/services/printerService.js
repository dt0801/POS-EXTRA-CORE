import { get, post } from "./apiClient";

export function fetchPrinterStatus() {
  return get("/print/status");
}

export function fetchWindowsPrinters() {
  return get("/printers");
}

export function fetchDbPrinters() {
  return get("/windows_printers");
}

export function addDbPrinter(payload) {
  return post("/windows_printers", payload);
}
