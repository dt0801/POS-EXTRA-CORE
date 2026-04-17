import {
  PREVIEW_TABLE_NUM,
  SAMPLE_ITEMS_BILL,
  SAMPLE_TOTAL_BILL,
  buildKitchenPreviewSampleItems,
} from "../components/bill/billPreviewSamples";

/**
 * Payload `receipt` cho POST /print/preview — khớp server/print-templates/receiptHtml (buildReceiptHtml).
 */

export function receiptPayloadKitchenPreview({ settings, language }) {
  return {
    hidePrices: true,
    title: "PHIẾU BẾP",
    tableNum: PREVIEW_TABLE_NUM,
    items: buildKitchenPreviewSampleItems(settings, language),
    timeValue: new Date().toLocaleString("vi-VN"),
  };
}

export function receiptPayloadTamtinhPreview() {
  return {
    totalLabel: "TẠM TÍNH",
    tableNum: PREVIEW_TABLE_NUM,
    items: SAMPLE_ITEMS_BILL,
    totalValue: SAMPLE_TOTAL_BILL,
    timeValue: new Date().toLocaleString("vi-VN"),
    footer: "",
  };
}

export function receiptPayloadBillPreview() {
  return {
    tableNum: PREVIEW_TABLE_NUM,
    items: SAMPLE_ITEMS_BILL,
    totalValue: SAMPLE_TOTAL_BILL,
    timeValue: new Date().toLocaleString("vi-VN"),
    billNo: "--",
    totalLabel: "THÀNH TIỀN",
    footer: "",
  };
}

export function receiptPayloadKitchenPrint({ tableNum, items, timeValue }) {
  return {
    hidePrices: true,
    title: "PHIẾU BẾP",
    tableNum,
    items,
    timeValue: timeValue || new Date().toLocaleString("vi-VN"),
  };
}

export function receiptPayloadTamTinhPrint({ tableNum, items, totalValue }) {
  return {
    totalLabel: "TẠM TÍNH",
    tableNum,
    items,
    totalValue,
    timeValue: new Date().toLocaleString("vi-VN"),
    footer: "",
  };
}

export function receiptPayloadBillPrint({
  tableNum,
  items,
  totalValue,
  billId,
  subtotalValue,
  discountPercent,
  discountAmount,
  tipAmount,
  cashGiven,
  changeDue,
}) {
  return {
    tableNum,
    items,
    totalValue,
    subtotalValue,
    discountPercent,
    discountAmount,
    tipAmount,
    cashGiven,
    changeDue,
    timeValue: new Date().toLocaleString("vi-VN"),
    billNo: billId != null && billId !== "" ? billId : "--",
    totalLabel: "THÀNH TIỀN",
    footer: "",
  };
}

export function receiptPayloadBillReprint({ bill }) {
  return {
    tableNum: bill.table_num,
    items: bill.items || [],
    totalValue: bill.total,
    timeValue: new Date(bill.created_at).toLocaleString("vi-VN"),
    billNo: bill.id,
    reprint: true,
    totalLabel: "THÀNH TIỀN",
    footer: "",
  };
}
