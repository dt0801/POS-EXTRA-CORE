const { PrinterTypes, CharacterSet } = require("node-thermal-printer");

function createTcpPrinterFactory({ createSafePrinter, getPrinterIP }) {
  return async function createPrinter(ip) {
    const printerIP = ip || getPrinterIP();
    return createSafePrinter({
      type: PrinterTypes.EPSON,
      interface: `tcp://${printerIP}`,
      characterSet: CharacterSet.TCVN_3_VIETNAMESE,
      removeSpecialCharacters: false,
      lineCharacter: "-",
      options: { timeout: 5000 },
    });
  };
}

module.exports = { createTcpPrinterFactory };
