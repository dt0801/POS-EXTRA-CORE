const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec } = require("child_process");
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
[RawPrinterHelper]::SendBytesToPrinter('${printer}', $hGlobal, $bytes.Length)
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($hGlobal)
Remove-Item -Path '${tmpBin.replace(/\\/g, "\\\\")}' -ErrorAction SilentlyContinue
`;

      fs.writeFileSync(tmpPsfile, psScript);
      exec(`powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tmpPsfile}"`, (err) => {
        try {
          fs.unlinkSync(tmpPsfile);
        } catch {}
        if (err) return error(err);
        success();
      });
    } catch (e) {
      error(e);
    }
  }
}

function createSafePrinter(config) {
  return new ThermalPrinter(config);
}

function listWindowsPrinters() {
  return new Promise((resolve) => {
    const cmd = `powershell -command "Get-Printer | Select-Object Name, PortName, PrinterStatus | ConvertTo-Json"`;
    exec(cmd, { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve([]);
      try {
        let printers = JSON.parse(stdout.trim());
        if (!Array.isArray(printers)) printers = [printers];
        resolve(
          printers.map((p) => ({
            name: p.Name,
            port: p.PortName,
            status: p.PrinterStatus === 0 ? "Ready" : "Unknown",
          }))
        );
      } catch {
        resolve([]);
      }
    });
  });
}

module.exports = {
  WindowsRawDriver,
  createSafePrinter,
  listWindowsPrinters,
};
