const DEFAULT_SETTINGS = [
  ["printer_ip", ""],
  ["printer_type", ""],
  ["store_name", ""],
  ["store_logo", ""],
  ["store_address", ""],
  ["store_phone", ""],
  ["cashier_name", ""],
  ["total_tables", "20"],
  ["bill_css_override", ""],
];

async function ensureDefaultSettings(mongoDb) {
  const settingsCol = mongoDb.collection("settings");
  await Promise.all(
    DEFAULT_SETTINGS.map(([key, value]) =>
      settingsCol.updateOne({ key }, { $set: { key, value } }, { upsert: true })
    )
  );
}

async function ensureDefaultOrderSession(mongoDb) {
  await mongoDb.collection("order_session").updateOne(
    { id: 1 },
    {
      $set: {
        id: 1,
        payload: JSON.stringify({ tableOrders: {}, itemNotes: {}, kitchenSent: {} }),
      },
    },
    { upsert: true }
  );
}

module.exports = { ensureDefaultSettings, ensureDefaultOrderSession };
