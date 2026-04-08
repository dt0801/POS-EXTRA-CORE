
async function dispatchToBridge(
  { enqueueJobsForType, createPrintJob },
  type,
  billId,
  receiptData
) {
  const renderedJobs = enqueueJobsForType(type, receiptData);
  if (!renderedJobs || renderedJobs.length === 0) {
    const err = new Error(`Chưa cấu hình máy in cho loại ${type}`);
    err.statusCode = 503;
    throw err;
  }

  const ids = [];
  for (const j of renderedJobs) {
    const doc = await createPrintJob(type, billId, {
      printType: j.printType,
      printerName: j.printerName,
      paperSize: j.paperSize,
      html: j.html,
    });
    ids.push(Number(doc.sqlite_id || 0));
  }
  return ids;
}

module.exports = { dispatchToBridge };
