/** Đồng bộ với pos-ui/src/constants/kitchenCategories.js — template phiếu in (server/print-templates/). */

const DEFAULT_KITCHEN_CATEGORIES_JSON = JSON.stringify([
  { id: "APPETIZER", labelVi: "Khai vị", labelDe: "Vorspeise", subtitleVi: "KHAI VỊ", order: 0, printer_dest: "KITCHEN" },
  { id: "SUSHI", labelVi: "Sushi / bar lạnh", labelDe: "Sushi", subtitleVi: "SUSHI", order: 1, printer_dest: "BAR" },
  { id: "MAIN", labelVi: "Món chính / bếp nóng", labelDe: "Hauptgericht", subtitleVi: "MÓN CHÍNH", order: 2, printer_dest: "KITCHEN" },
]);

function parseKitchenCategoriesList(settings) {
  try {
    const raw = settings?.kitchen_categories_json;
    const arr = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? raw : null;
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("empty");
    return arr
      .map((c, i) => {
        const id =
          String(c.id || "")
            .trim()
            .replace(/\s+/g, "_")
            .slice(0, 64) || `CAT_${i}`;
        const ord = Number(c.order);
        const labelVi = String(c.labelVi ?? id);
        const labelDe = String(c.labelDe ?? "");
        let subtitleVi;
        if (c.subtitleVi != null) subtitleVi = String(c.subtitleVi);
        else if (c.labelVi != null) subtitleVi = String(c.labelVi);
        else subtitleVi = String(id);
        const printer_dest = String(c.printer_dest || "KITCHEN").toUpperCase();
        return {
          id,
          labelVi,
          labelDe,
          subtitleVi: subtitleVi.toUpperCase(),
          order: Number.isFinite(ord) ? ord : i,
          printer_dest,
        };
      })
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  } catch {
    return parseKitchenCategoriesList({ kitchen_categories_json: DEFAULT_KITCHEN_CATEGORIES_JSON });
  }
}

function effectiveKitchenCategory(item, settings) {
  const t = item?.type || "FOOD";
  if (t === "DRINK") return "DRINK";
  const list = parseKitchenCategoriesList(settings);
  const ids = new Set(list.map((c) => c.id));
  const k = item?.kitchen_category;
  if (k && ids.has(k)) return k;
  const main = list.find((c) => c.id === "MAIN");
  return main?.id || list[0]?.id || "MAIN";
}

function kitchenCategoryPrintLabelVi(settings, categoryId) {
  const row = parseKitchenCategoriesList(settings).find((c) => c.id === categoryId);
  return row?.subtitleVi || String(categoryId || "").toUpperCase();
}

function kitchenPrintOrderFromSettings(settings) {
  return parseKitchenCategoriesList(settings).map((c) => c.id);
}

module.exports = {
  parseKitchenCategoriesList,
  effectiveKitchenCategory,
  kitchenCategoryPrintLabelVi,
  kitchenPrintOrderFromSettings,
  DEFAULT_KITCHEN_CATEGORIES_JSON,
};
