/** Nhóm in bếp (FOOD/COMBO). Đồ uống dùng type === "DRINK", in phiếu pha chế riêng. */
export const KITCHEN_PRINT_ORDER = ["APPETIZER", "SUSHI", "MAIN"];

export const KITCHEN_CATEGORY_OPTIONS = [
  { value: "APPETIZER", labelVi: "Khai vị", labelDe: "Vorspeise" },
  { value: "SUSHI", labelVi: "Sushi / bar lạnh", labelDe: "Sushi" },
  { value: "MAIN", labelVi: "Món chính / bếp nóng", labelDe: "Hauptgericht" },
];

export const DEFAULT_KITCHEN_CATEGORY = "MAIN";

export function effectiveKitchenCategory(item) {
  const t = item?.type || "FOOD";
  if (t === "DRINK") return "DRINK";
  const k = item?.kitchen_category;
  if (k === "APPETIZER" || k === "SUSHI" || k === "MAIN") return k;
  return DEFAULT_KITCHEN_CATEGORY;
}

export function kitchenSectionLabelVi(cat) {
  switch (cat) {
    case "APPETIZER":
      return "KHAI VỊ";
    case "SUSHI":
      return "SUSHI";
    case "MAIN":
      return "MÓN CHÍNH";
    default:
      return "MÓN";
  }
}
