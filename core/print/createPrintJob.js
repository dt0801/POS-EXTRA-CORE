async function createPrintJob(
  { mongoDb, getNextMongoId, broadcastToBridges },
  jobType,
  billId,
  payload
) {
  const nextId = await getNextMongoId("print_jobs");
  const doc = {
    sqlite_id: nextId,
    bill_id: billId || null,
    job_type: jobType,
    payload,
    status: "pending",
    error_message: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await mongoDb.collection("print_jobs").insertOne(doc);
  broadcastToBridges({
    event: "NEW_PRINT_JOB",
    job: {
      id: nextId,
      bill_id: doc.bill_id,
      job_type: doc.job_type,
      payload: doc.payload,
      status: doc.status,
      error_message: doc.error_message,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    },
  });
  return doc;
}

module.exports = { createPrintJob };
