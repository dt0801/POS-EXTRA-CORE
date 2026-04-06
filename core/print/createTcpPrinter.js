const { PrinterTypes, CharacterSet } = require("node-thermal-printer");

function resolveVietnameseCharset() {
  const raw = String(process.env.PRINT_CHARSET || "").trim().toUpperCase();
  if (raw && CharacterSet[raw]) return CharacterSet[raw];
  // TM-m30III in tiếng Việt ổn định hơn với Windows-1258.
  return CharacterSet.WPC1258_VIETNAMESE || CharacterSet.TCVN_VIETNAMESE;
}

function createTcpPrinterFactory({ createSafePrinter, getPrinterIP }) {
  return async function createPrinter(ip) {
    const printerIP = ip || getPrinterIP();
    return createSafePrinter({
      type: PrinterTypes.EPSON,
      interface: `tcp://${printerIP}`,
      characterSet: resolveVietnameseCharset(),
      removeSpecialCharacters: false,
      lineCharacter: "-",
      options: { timeout: 5000 },
    });
  };
}

module.exports = { createTcpPrinterFactory };
