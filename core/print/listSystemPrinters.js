async function listSystemPrinters({ listWindowsPrinters }) {
  const printers = await listWindowsPrinters();
  return { status: 200, body: printers };
}

module.exports = { listSystemPrinters };
