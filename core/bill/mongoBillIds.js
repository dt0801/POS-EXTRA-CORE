/** Mongo có thể lưu sqlite_id / bill_id dạng number hoặc string */
function mongoBillBySqliteId(billId) {
  const n = Number(billId);
  return { $or: [{ sqlite_id: n }, { sqlite_id: String(n) }] };
}

function mongoItemsByBillId(billId) {
  const n = Number(billId);
  return { $or: [{ bill_id: n }, { bill_id: String(n) }] };
}

module.exports = { mongoBillBySqliteId, mongoItemsByBillId };
