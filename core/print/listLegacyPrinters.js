const { mapToLegacyPrinter } = require("./mapToLegacyPrinter");

function listLegacyPrinters({ printersCache }) {
  try {
    return { status: 200, body: printersCache.map(mapToLegacyPrinter) };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = { listLegacyPrinters };
