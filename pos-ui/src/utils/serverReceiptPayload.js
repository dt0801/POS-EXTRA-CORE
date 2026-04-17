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
    language,
    hidePrices: true,
    title: "PHIẾU BẾP",
    tableNum: PREVIEW_TABLE_NUM,
    items: buildKitchenPreviewSampleItems(settings, language),
    timeValue: new Date().toLocaleString(language === "de" ? "de-DE" : "vi-VN"),
  };
}

export function receiptPayloadTamtinhPreview() {
  return {
    language: "vi",
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
    language: "vi",
    tableNum: PREVIEW_TABLE_NUM,
    items: SAMPLE_ITEMS_BILL,
    totalValue: SAMPLE_TOTAL_BILL,
    timeValue: new Date().toLocaleString("vi-VN"),
    billNo: "--",
    totalLabel: "THÀNH TIỀN",
    footer: "",
  };
}

export function receiptPayloadKitchenPrint({ tableNum, items, timeValue, language = "vi" }) {
  return {
    language,
    hidePrices: true,
    title: "PHIẾU BẾP",
    tableNum,
    items,
    timeValue: timeValue || new Date().toLocaleString(language === "de" ? "de-DE" : "vi-VN"),
  };
}

export function receiptPayloadTamTinhPrint({ tableNum, items, totalValue, language = "vi" }) {
  return {
    language,
    totalLabel: "TẠM TÍNH",
    tableNum,
    items,
    totalValue,
    timeValue: new Date().toLocaleString(language === "de" ? "de-DE" : "vi-VN"),
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
  cashGiven,
  changeDue,
  language = "vi",
}) {
  return {
    language,
    tableNum,
    items,
    totalValue,
    subtotalValue,
    discountPercent,
    discountAmount,
    cashGiven,
    changeDue,
    timeValue: new Date().toLocaleString(language === "de" ? "de-DE" : "vi-VN"),
    billNo: billId != null && billId !== "" ? billId : "--",
    totalLabel: "THÀNH TIỀN",
    footer: "",
  };
}

export function receiptPayloadBillReprint({ bill, language = "vi" }) {
  return {
    language,
    tableNum: bill.table_num,
    items: bill.items || [],
    totalValue: bill.total,
    subtotalValue: bill.subtotal,
    discountPercent: bill.discount_percent,
    discountAmount: bill.discount_amount,
    cashGiven: bill.cash_given,
    changeDue: bill.change_due,
    timeValue: new Date(bill.created_at).toLocaleString(language === "de" ? "de-DE" : "vi-VN"),
    billNo: bill.id,
    reprint: true,
    totalLabel: "THÀNH TIỀN",
    footer: "",
  };
}
