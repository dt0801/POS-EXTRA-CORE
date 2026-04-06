const { PrinterTypes } = require("node-thermal-printer");

async function getPrintStatus({ bridgeClients, printersCache, createSafePrinter, customDriver }) {
  if (bridgeClients.size > 0) {
    return {
      status: 200,
      body: {
        connected: true,
        bridge_count: bridgeClients.size,
        mode: "bridge",
      },
    };
  }
  const printers = printersCache.filter((p) => Number(p.is_enabled) === 1);
  if (printers.length === 0) return { status: 200, body: { connected: false } };

  let allConnected = false;
  for (const p of printers) {
    try {
      const pt = createSafePrinter({
        type: PrinterTypes.EPSON,
        interface: `printer:${p.name}`,
        driver: customDriver,
      });
      if (await pt.isPrinterConnected()) {
        allConnected = true;
        break;
      }
    } catch (e) {
      // skip
    }
  }
  return {
    status: 200,
    body: {
      connected: allConnected,
      count: printers.length,
      bridge_count: bridgeClients.size,
      mode: "local",
    },
  };
}

module.exports = { getPrintStatus };
