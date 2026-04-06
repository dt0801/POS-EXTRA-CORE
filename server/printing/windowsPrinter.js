const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec, execFile } = require("child_process");
const { ThermalPrinter } = require("node-thermal-printer");

class WindowsRawDriver {
  getPrinters() {
    return [];
  }

  getPrinter(name) {
    return { name, status: "READY" };
  }

  printDirect({ data, printer, success, error }) {
    try {
      const psSuffix = Date.now() + Math.floor(Math.random() * 10000);
      const tmpBin = path.join(os.tmpdir(), `print_${psSuffix}.bin`);
      const tmpPsfile = path.join(os.tmpdir(), `print_${psSuffix}.ps1`);

      fs.writeFileSync(tmpBin, data);

      const normalizeName = (s) =>
        String(s || "")
          .replace(/^\uFEFF/, "")
          .trim()
          .replace(/\s+/g, " ");

      const pickPrinterName = async (wanted) => {
        const w = normalizeName(wanted);
        if (!w) return { picked: wanted, reason: "empty" };
        const list = await listWindowsPrinters();
        const names = list.map((p) => normalizeName(p.name)).filter(Boolean);
        if (!names.length) return { picked: wanted, reason: "no_list" };

        // 1) exact (normalized)
        const exact = names.find((n) => n === w);
        if (exact) return { picked: exact, reason: "exact" };

        // 2) case-insensitive
        const wl = w.toLowerCase();
        const ci = names.find((n) => n.toLowerCase() === wl);
        if (ci) return { picked: ci, reason: "case_insensitive" };

        // 3) substring match (best effort)
        const contains = names.find((n) => n.toLowerCase().includes(wl));
        if (contains) return { picked: contains, reason: "contains" };

        return { picked: wanted, reason: "not_found", candidates: names.slice(0, 30) };
      };

      const wantedPrinterName = String(printer || "");
      Promise.resolve(pickPrinterName(wantedPrinterName)).then((pickedInfo) => {
        const pickedPrinterName = String(pickedInfo?.picked || wantedPrinterName);

        const psScript = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, IntPtr pBytes, int dwCount) {
        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        bool bSuccess = false;
        di.pDocName = "RAW POS Print";
        di.pDataType = "RAW";
        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    int dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pBytes, dwCount, out dwWritten);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}
"@
Add-Type -TypeDefinition $code -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes('${tmpBin.replace(/\\/g, "\\\\")}')
$hGlobal = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $hGlobal, $bytes.Length)
[RawPrinterHelper]::SendBytesToPrinter('${pickedPrinterName.replace(/'/g, "''")}', $hGlobal, $bytes.Length)
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($hGlobal)
Remove-Item -Path '${tmpBin.replace(/\\/g, "\\\\")}' -ErrorAction SilentlyContinue
`;

        fs.writeFileSync(tmpPsfile, psScript);
        exec(`powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tmpPsfile}"`, (err) => {
          try {
            fs.unlinkSync(tmpPsfile);
          } catch {}
          if (err) {
            const extra =
              pickedInfo?.reason === "not_found" && Array.isArray(pickedInfo.candidates)
                ? `; Available printers (sample): ${pickedInfo.candidates.join(" | ")}`
                : pickedInfo?.reason && pickedInfo.reason !== "exact"
                  ? `; picked_by=${pickedInfo.reason}; picked="${pickedPrinterName}"`
                  : "";
            const wrapped = new Error(
              `OpenPrinter [${wantedPrinterName}] thất bại: ${err.message || err}${extra}`
            );
            return error(wrapped);
          }
          success();
        });
      });
    } catch (e) {
      error(e);
    }
  }
}

function createSafePrinter(config) {
  return new ThermalPrinter(config);
}

function powershellExePath() {
  const root = process.env.SystemRoot || process.env.windir;
  if (root) {
    return path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  }
  return "powershell.exe";
}

function listWindowsPrinters() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      return resolve([]);
    }

    const script =
      "Get-Printer | Select-Object Name, PortName, PrinterStatus | ConvertTo-Json -Compress -Depth 3";
    execFile(
      powershellExePath(),
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: 15000, windowsHide: true, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          console.error("listWindowsPrinters:", err.message, stderr ? String(stderr).slice(0, 400) : "");
          return resolve([]);
        }
        const text = String(stdout || "")
          .replace(/^\uFEFF/, "")
          .trim();
        if (!text) return resolve([]);
        try {
          let printers = JSON.parse(text);
          if (!Array.isArray(printers)) printers = [printers];
          const mapped = printers
            .map((p) => {
              const name = p.Name ?? p.name;
              const port = p.PortName ?? p.portName;
              const st = p.PrinterStatus ?? p.printerStatus;
              return {
                name: name != null ? String(name) : "",
                port: port != null ? String(port) : "",
                status: st === 0 || st === "Normal" ? "Ready" : "Unknown",
              };
            })
            .filter((p) => p.name);
          resolve(mapped);
        } catch (e) {
          console.error("listWindowsPrinters JSON:", e.message, text.slice(0, 200));
          resolve([]);
        }
      }
    );
  });
}

module.exports = {
  WindowsRawDriver,
  createSafePrinter,
  listWindowsPrinters,
};
