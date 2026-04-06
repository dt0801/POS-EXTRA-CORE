import React, { useMemo } from "react";
import { generateBillHTML } from "../../hooks/billHTML";
import { parseKitchenCategoriesList } from "../../constants/kitchenCategories";

export const PREVIEW_TABLE_NUM = 5;

/** Khớp maxW trong generateBillHTML (58mm → 220px, 80mm → 320px). */
export function billPreviewFrameWidthPx(paperSizeMm) {
  return Number(paperSizeMm) === 58 ? 220 : 320;
}

/** Máy in bật đầu tiên khớp loại phiếu (hoặc ALL), mặc định 80mm. */
export function billPreviewPaperMm(billType, dbPrinters) {
  const map = { bill: "BILL", tamtinh: "TAMTINH", kitchen: "KITCHEN" };
  const want = map[billType] || "BILL";
  const list = (dbPrinters || []).filter(
    (p) => Number(p.is_enabled) !== 0 && (String(p.type || "").toUpperCase() === want || String(p.type || "").toUpperCase() === "ALL")
  );
  const ps = Number(list[0]?.paper_size);
  return ps === 58 ? 58 : 80;
}

// Giá theo cent (EUR) — cùng đơn vị với pos-ui / DB
export const SAMPLE_ITEMS_BILL = [
  { name: "Gà nướng muối ớt", qty: 2, price: 850 },
  { name: "Bò lúc lắc tỏi đen", qty: 1, price: 1200 },
  { name: "Nước ngọt lon", qty: 3, price: 150 },
];

/** Mẫu cố định (legacy); preview phiếu bếp dùng buildKitchenPreviewSampleItems theo settings. */
export const SAMPLE_ITEMS_KITCHEN = [
  { name: "Salad trứng", qty: 1, note: "", kitchen_category: "APPETIZER", type: "FOOD" },
  { name: "California roll", qty: 2, note: "Không wasabi", kitchen_category: "SUSHI", type: "FOOD" },
  { name: "Gà nướng muối ớt", qty: 1, note: "Ít cay", kitchen_category: "MAIN", type: "FOOD" },
];

export const SAMPLE_TOTAL_BILL = SAMPLE_ITEMS_BILL.reduce((s, i) => s + i.price * i.qty, 0);

/**
 * Một dòng mẫu / nhóm — đúng thứ tự & id như Danh mục bếp trong settings (kể cả danh mục mới tạo).
 */
export function buildKitchenPreviewSampleItems(settings, language = "vi") {
  const list = parseKitchenCategoriesList(settings);
  const note = language === "de" ? "(Vorschau)" : "(mẫu preview)";
  return list.map((row) => ({
    name: language === "de" ? row.labelDe || row.labelVi || row.id : row.labelVi || row.id,
    qty: 1,
    note,
    kitchen_category: row.id,
    type: "FOOD",
  }));
}

export default function BillPreview({ settings, billType, titleHint, language = "vi", dbPrinters }) {
  const paperSizeMm = useMemo(() => billPreviewPaperMm(billType, dbPrinters), [billType, dbPrinters]);
  const frameW = billPreviewFrameWidthPx(paperSizeMm);
  const injectExtraCss = settings.bill_css_override || "";

  const html = useMemo(() => {
    const common = { settings, paperSizeMm, injectExtraCss };
    if (billType === "kitchen") {
      return generateBillHTML({
        ...common,
        type: "kitchen",
        tableNum: PREVIEW_TABLE_NUM,
        items: buildKitchenPreviewSampleItems(settings, language),
        total: 0,
      });
    }
    if (billType === "tamtinh") {
      return generateBillHTML({
        ...common,
        type: "tamtinh",
        tableNum: PREVIEW_TABLE_NUM,
        items: SAMPLE_ITEMS_BILL,
        total: SAMPLE_TOTAL_BILL,
      });
    }
    return generateBillHTML({
      ...common,
      type: "bill",
      tableNum: PREVIEW_TABLE_NUM,
      items: SAMPLE_ITEMS_BILL,
      total: SAMPLE_TOTAL_BILL,
    });
  }, [settings, billType, language, paperSizeMm, injectExtraCss]);

  return (
    <div className="w-full overflow-auto rounded-b-lg bg-white" style={{ maxHeight: "min(65vh, 560px)" }}>
      <iframe
        title={titleHint ? `Preview — ${titleHint}` : "Bill preview"}
        sandbox="allow-same-origin"
        srcDoc={html}
        className="block w-full border-0 bg-white"
        style={{ width: frameW, minHeight: 420, height: 720 }}
      />
    </div>
  );
}
