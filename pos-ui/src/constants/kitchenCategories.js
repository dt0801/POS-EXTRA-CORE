/** JSON mặc định — đồng bộ với server `DEFAULT_KITCHEN_CATEGORIES_JSON` */
export const DEFAULT_KITCHEN_CATEGORIES_JSON = JSON.stringify([
  { id: "APPETIZER", labelVi: "Khai vị", labelDe: "Vorspeise", subtitleVi: "KHAI VỊ", order: 0 },
  { id: "SUSHI", labelVi: "Sushi / bar lạnh", labelDe: "Sushi", subtitleVi: "SUSHI", order: 1 },
  { id: "MAIN", labelVi: "Món chính / bếp nóng", labelDe: "Hauptgericht", subtitleVi: "MÓN CHÍNH", order: 2 },
]);

/**
 * @returns {{ id: string, labelVi: string, labelDe: string, subtitleVi: string, order: number }[]}
 */
export function parseKitchenCategoriesList(settings) {
  try {
    const raw = settings?.kitchen_categories_json;
    const arr = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? raw : null;
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("empty");
    return arr
      .map((c, i) => {
        const id = String(c.id || "")
          .trim()
          .replace(/\s+/g, "_")
          .slice(0, 64) || `CAT_${i}`;
        const ord = Number(c.order);
        return {
          id,
          labelVi: String(c.labelVi || id),
          labelDe: String(c.labelDe || ""),
          subtitleVi: String(c.subtitleVi || c.labelVi || id).toUpperCase(),
          order: Number.isFinite(ord) ? ord : i,
        };
      })
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  } catch {
    return parseKitchenCategoriesList({ kitchen_categories_json: DEFAULT_KITCHEN_CATEGORIES_JSON });
  }
}

export function firstKitchenCategoryId(settings) {
  const list = parseKitchenCategoriesList(settings);
  return list[0]?.id || "MAIN";
}

export function effectiveKitchenCategory(item, settings) {
  const t = item?.type || "FOOD";
  if (t === "DRINK") return "DRINK";
  const list = parseKitchenCategoriesList(settings);
  const ids = new Set(list.map((c) => c.id));
  const k = item?.kitchen_category;
  if (k && ids.has(k)) return k;
  const main = list.find((c) => c.id === "MAIN");
  return main?.id || list[0]?.id || "MAIN";
}

export function kitchenCategoryDisplayLabel(settings, categoryId, language) {
  if (categoryId === "DRINK") return language === "de" ? "Getränk" : "Đồ uống";
  const row = parseKitchenCategoriesList(settings).find((c) => c.id === categoryId);
  if (!row) return categoryId;
  return language === "de" ? row.labelDe || row.labelVi : row.labelVi;
}

/** Nhãn in (phiếu bếp) — tiếng Việt */
export function kitchenCategoryPrintLabelVi(settings, categoryId) {
  const row = parseKitchenCategoriesList(settings).find((c) => c.id === categoryId);
  return row?.subtitleVi || String(categoryId || "").toUpperCase();
}

export const KITCHEN_PRINT_ORDER_FROM_SETTINGS = (settings) => parseKitchenCategoriesList(settings).map((c) => c.id);

/** Nút lọc màn hình đặt món: Tất cả + Combo + từng danh mục bếp + Đồ uống */
export function buildMenuPosFilterChips(settings) {
  const list = parseKitchenCategoriesList(settings);
  return [
    { key: "ALL", labelVi: "Tất cả", labelDe: "Alle" },
    { key: "COMBO", labelVi: "Combo", labelDe: "Combo" },
    ...list.map((c) => ({
      key: c.id,
      labelVi: c.labelVi,
      labelDe: c.labelDe || c.labelVi,
    })),
    { key: "DRINK", labelVi: "Đồ uống", labelDe: "Getränke" },
  ];
}

export function menuPosFilterLabel(chip, language) {
  if (!chip) return "";
  return language === "de" ? chip.labelDe || chip.labelVi : chip.labelVi;
}
