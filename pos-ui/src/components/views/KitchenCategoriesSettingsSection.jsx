import React, { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_KITCHEN_CATEGORIES_JSON,
  parseKitchenCategoriesList,
} from "../../constants/kitchenCategories";

function safeParseList(json) {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

/**
 * CRUD danh mục in bếp — lưu vào settings.kitchen_categories_json
 */
export default function KitchenCategoriesSettingsSection({
  settings,
  setSettings,
  mergeAndSaveSettings,
  settingsSaved,
  tt,
}) {
  const initialJson = settings.kitchen_categories_json || DEFAULT_KITCHEN_CATEGORIES_JSON;
  const [jsonText, setJsonText] = useState(initialJson);
  const [parseError, setParseError] = useState(null);

  useEffect(() => {
    setJsonText(settings.kitchen_categories_json || DEFAULT_KITCHEN_CATEGORIES_JSON);
  }, [settings.kitchen_categories_json]);

  const rows = useMemo(() => {
    const p = safeParseList(jsonText);
    if (!p) return [];
    return parseKitchenCategoriesList({ kitchen_categories_json: JSON.stringify(p) });
  }, [jsonText]);

  useEffect(() => {
    const p = safeParseList(jsonText);
    setParseError(p ? null : tt("JSON không hợp lệ", "Ungültiges JSON"));
  }, [jsonText, tt]);

  const syncFromSettings = () => setJsonText(settings.kitchen_categories_json || DEFAULT_KITCHEN_CATEGORIES_JSON);

  const updateRows = (nextList) => {
    setJsonText(JSON.stringify(nextList, null, 0));
  };

  const move = (index, dir) => {
    const list = parseKitchenCategoriesList({ kitchen_categories_json: jsonText });
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const a = [...list];
    [a[index], a[j]] = [a[j], a[index]];
    a.forEach((r, i) => {
      r.order = i;
    });
    updateRows(a);
  };

  const addRow = () => {
    const list = parseKitchenCategoriesList({ kitchen_categories_json: jsonText });
    const id = `CAT_${Date.now()}`;
    list.push({
      id,
      labelVi: tt("Danh mục mới", "Neue Kategorie"),
      labelDe: "",
      subtitleVi: id,
      order: list.length,
    });
    updateRows(list);
  };

  const removeRow = (id) => {
    if (!window.confirm(tt("Xóa danh mục này? Món đang dùng sẽ gán lại mặc định khi lưu.", "Kategorie löschen?"))) return;
    const list = parseKitchenCategoriesList({ kitchen_categories_json: jsonText }).filter((r) => r.id !== id);
    list.forEach((r, i) => {
      r.order = i;
    });
    if (list.length === 0) {
      setJsonText(DEFAULT_KITCHEN_CATEGORIES_JSON);
      return;
    }
    updateRows(list);
  };

  const patchRow = (id, field, value) => {
    const list = parseKitchenCategoriesList({ kitchen_categories_json: jsonText }).map((r) =>
      r.id === id ? { ...r, [field]: value } : r
    );
    updateRows(list);
  };

  const applyToSettingsAndSave = async () => {
    const p = safeParseList(jsonText);
    if (!p || p.length === 0) {
      alert(tt("Chưa có danh mục hợp lệ.", "Keine gültigen Kategorien."));
      return;
    }
    await mergeAndSaveSettings({ kitchen_categories_json: jsonText });
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-sm text-amber-950 dark:text-amber-100">
        <p className="font-bold mb-1">{tt("Danh mục in bếp", "Küchen-Kategorien")}</p>
        <p className="opacity-90 leading-relaxed">
          {tt(
            "Mỗi danh mục = một phiếu bếp riêng (theo thứ tự). Đồ uống vẫn in phiếu pha chế. Mã (id) không đổi sau khi tạo để tránh lệch dữ liệu món.",
            "Jede Kategorie = eigenes Küchenticket. Getränke separat. ID nach dem Anlegen nicht ändern."
          )}
        </p>
      </div>

      {parseError && (
        <div className="text-error text-sm font-semibold px-3 py-2 rounded-xl bg-error/10">{parseError}</div>
      )}

      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <h4 className="font-bold text-on-surface">{tt("Danh sách", "Liste")}</h4>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={syncFromSettings}
              className="text-xs font-bold px-3 py-2 rounded-xl border border-outline-variant/50 text-on-surface-variant hover:bg-surface-container-high"
            >
              {tt("Hoàn tác từ server", "Vom Server")}
            </button>
            <button
              type="button"
              onClick={addRow}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-primary text-white"
            >
              + {tt("Thêm", "Neu")}
            </button>
          </div>
        </div>
        <div className="divide-y divide-outline-variant/20">
          {rows.map((r, index) => (
            <div key={r.id} className="p-4 flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="w-9 h-9 rounded-lg bg-surface-container-high text-on-surface disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === rows.length - 1}
                  className="w-9 h-9 rounded-lg bg-surface-container-high text-on-surface disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1 min-w-0">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">ID</label>
                  <input
                    readOnly
                    value={r.id}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-high text-on-surface text-sm font-mono opacity-90"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">
                    {tt("Tên (VI)", "Name (VI)")}
                  </label>
                  <input
                    value={r.labelVi}
                    onChange={(e) => patchRow(r.id, "labelVi", e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container border border-outline-variant/40 text-on-surface text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">
                    {tt("Tên (DE)", "Name (DE)")}
                  </label>
                  <input
                    value={r.labelDe}
                    onChange={(e) => patchRow(r.id, "labelDe", e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container border border-outline-variant/40 text-on-surface text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">
                    {tt("Nhãn in (VI)", "Druck-Label (VI)")}
                  </label>
                  <input
                    value={r.subtitleVi}
                    onChange={(e) => patchRow(r.id, "subtitleVi", e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container border border-outline-variant/40 text-on-surface text-sm"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeRow(r.id)}
                className="shrink-0 px-3 py-2 rounded-xl text-error font-bold text-sm hover:bg-error/10"
              >
                {tt("Xóa", "Löschen")}
              </button>
            </div>
          ))}
        </div>
      </div>

      <details className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-4">
        <summary className="font-bold cursor-pointer text-on-surface">{tt("JSON thô (nâng cao)", "JSON (fortg.)")}</summary>
        <textarea
          className="w-full mt-3 h-40 font-mono text-xs p-3 rounded-xl bg-surface-container border border-outline-variant/40 text-on-surface"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </details>

      <button
        type="button"
        onClick={applyToSettingsAndSave}
        disabled={!!parseError}
        className={`w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-white ${parseError ? "bg-outline-variant" : settingsSaved ? "bg-green-600" : "bg-primary"}`}
      >
        {settingsSaved ? tt("Đã lưu", "Gespeichert") : tt("Lưu danh mục & đồng bộ", "Kategorien speichern")}
      </button>
    </div>
  );
}
