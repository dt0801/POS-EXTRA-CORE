async function listPrintJobs({ mongoDb }, { status, limit }) {
  try {
    const st = String(status || "pending");
    const lim = Number(limit) || 50;
    const docs = await mongoDb
      .collection("print_jobs")
      .find({ status: st })
      .sort({ sqlite_id: 1 })
      .limit(lim)
      .toArray();
    return {
      status: 200,
      body: docs.map((d) => ({
        id: Number(d.sqlite_id || 0),
        bill_id: d.bill_id ?? null,
        job_type: d.job_type,
        payload: d.payload,
        status: d.status || "pending",
        error_message: d.error_message || "",
        created_at: d.created_at,
        updated_at: d.updated_at,
      })),
    };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

async function markPrintJobDone({ mongoDb }, id) {
  try {
    const result = await mongoDb.collection("print_jobs").updateOne(
      { sqlite_id: id, status: "pending" },
      { $set: { status: "done", updated_at: new Date().toISOString() } }
    );
    if (!result.matchedCount) return { status: 404, body: { error: "Job không tồn tại hoặc đã xử lý" } };
    const job = await mongoDb.collection("print_jobs").findOne({ sqlite_id: id });
    return { status: 200, body: { success: true, job } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

async function markPrintJobFail({ mongoDb }, { id, error_message }) {
  try {
    const result = await mongoDb.collection("print_jobs").updateOne(
      { sqlite_id: id },
      {
        $set: {
          status: "failed",
          error_message: String(error_message || "Unknown error"),
          updated_at: new Date().toISOString(),
        },
      }
    );
    if (!result.matchedCount) return { status: 404, body: { error: "Job không tồn tại" } };
    const job = await mongoDb.collection("print_jobs").findOne({ sqlite_id: id });
    return { status: 200, body: { success: true, job } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

async function retryPrintJob({ mongoDb, broadcastToBridges }, id) {
  try {
    const result = await mongoDb.collection("print_jobs").updateOne(
      { sqlite_id: id },
      {
        $set: {
          status: "pending",
          error_message: "",
          updated_at: new Date().toISOString(),
        },
      }
    );
    if (!result.matchedCount) return { status: 404, body: { error: "Job không tồn tại" } };
    const job = await mongoDb.collection("print_jobs").findOne({ sqlite_id: id });
    broadcastToBridges({ event: "NEW_PRINT_JOB", job });
    return { status: 200, body: { success: true, job } };
  } catch (e) {
    return { status: 500, body: { error: e.message || String(e) } };
  }
}

module.exports = {
  listPrintJobs,
  markPrintJobDone,
  markPrintJobFail,
  retryPrintJob,
};
