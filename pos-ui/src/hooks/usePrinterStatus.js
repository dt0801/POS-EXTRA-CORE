import { useEffect, useState } from "react";
import { fetchPrinterStatus } from "../services/printerService";

export function usePrinterStatus() {
  const [printerStatus, setPrinterStatus] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const checkPrinter = async () => {
      try {
        const data = await fetchPrinterStatus();
        if (!isMounted) return;
        setPrinterStatus(data.connected ? "online" : "offline");
      } catch {
        if (!isMounted) return;
        setPrinterStatus("offline");
      }
    };

    checkPrinter();
    const interval = setInterval(checkPrinter, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { printerStatus, setPrinterStatus };
}
