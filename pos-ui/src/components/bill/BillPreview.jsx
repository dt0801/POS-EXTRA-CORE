import React, { useMemo } from "react";
import { generateBillHTML } from "../../hooks/billHTML";

export const PREVIEW_TABLE_NUM = 5;

// Giá theo cent (EUR) — cùng đơn vị với pos-ui / DB
export const SAMPLE_ITEMS_BILL = [
  { name: "Gà nướng muối ớt", qty: 2, price: 850 },
  { name: "Bò lúc lắc tỏi đen", qty: 1, price: 1200 },
  { name: "Nước ngọt lon", qty: 3, price: 150 },
];

export const SAMPLE_ITEMS_KITCHEN = [
  { name: "Gà nướng muối ớt", qty: 2, note: "Ít cay" },
  { name: "Bò lúc lắc tỏi đen", qty: 1, note: "" },
  { name: "Nước ngọt lon", qty: 3, note: "" },
];

export const SAMPLE_TOTAL_BILL = SAMPLE_ITEMS_BILL.reduce((s, i) => s + i.price * i.qty, 0);

export default function BillPreview({ settings, billType, titleHint }) {
  const html = useMemo(() => {
    if (billType === "kitchen") {
      return generateBillHTML({
        settings,
        type: "kitchen",
        tableNum: PREVIEW_TABLE_NUM,
        items: SAMPLE_ITEMS_KITCHEN,
        total: 0,
      });
    }
    if (billType === "tamtinh") {
      return generateBillHTML({
        settings,
        type: "tamtinh",
        tableNum: PREVIEW_TABLE_NUM,
        items: SAMPLE_ITEMS_BILL,
        total: SAMPLE_TOTAL_BILL,
      });
    }
    return generateBillHTML({
      settings,
      type: "bill",
      tableNum: PREVIEW_TABLE_NUM,
      items: SAMPLE_ITEMS_BILL,
      total: SAMPLE_TOTAL_BILL,
    });
  }, [settings, billType]);

  return (
    <div className="w-full overflow-auto rounded-b-lg bg-white" style={{ maxHeight: "min(65vh, 560px)" }}>
      <iframe
        title={titleHint ? `Preview — ${titleHint}` : "Bill preview"}
        sandbox="allow-same-origin"
        srcDoc={html}
        className="block w-full border-0 bg-white"
        style={{ width: 320, minHeight: 420, height: 720 }}
      />
    </div>
  );
}
