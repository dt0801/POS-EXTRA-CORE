import React, { useMemo, useState } from "react";
import BillPreview from "../bill/BillPreview";
import { buildCfg, BILL_TYPE_PREFIX } from "../../hooks/billHTML";

/**
 * Tab Cài đặt — Report Bill: 3 loại phiếu, form + preview (mẫu tiếng Việt).
 */
export default function ReportBillSettingsSection({
  settings,
  setSettings,
  saveAllSettings,
  settingsSaved,
  tt,
  toggleLanguage,
  language,
}) {
  const [billType, setBillType] = useState("bill");
  const P = BILL_TYPE_PREFIX[billType];
  const get = (k) => settings[P + k] || "";
  const set = (k, v) => setSettings((s) => ({ ...s, [P + k]: v }));
  const tog = (k) => set(k, settings[P + k] !== "false" ? "false" : "true");
  const reportBillCfg = useMemo(() => buildCfg(settings, billType), [settings, billType]);

  const subTabs = [
    { key: "bill", icon: "receipt_long", label: tt("Hóa đơn TT", "Zahlungsbeleg") },
    { key: "tamtinh", icon: "request_quote", label: tt("Tạm tính", "Proforma") },
    { key: "kitchen", icon: "restaurant_menu", label: tt("Phiếu bếp", "Küche") },
  ];

  const inputCls =
    "w-full bg-surface-container border border-outline-variant/40 rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface outline-none focus:ring-2 focus:ring-primary/25";

  const Field = ({ label, k, placeholder, type = "text" }) => (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{label}</label>
      {type === "textarea" ? (
        <textarea
          rows={2}
          value={get(k)}
          placeholder={placeholder}
          onChange={(e) => set(k, e.target.value)}
          className={`${inputCls} resize-none min-h-[72px]`}
        />
      ) : (
        <input type={type} value={get(k)} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} className={inputCls} />
      )}
    </div>
  );

  const Toggle = ({ label, k, desc }) => (
    <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
      <div>
        <div className="text-sm font-bold text-on-surface">{label}</div>
        {desc && <div className="text-xs text-on-surface-variant mt-0.5">{desc}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={settings[P + k] !== "false"}
        onClick={() => tog(k)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
          settings[P + k] !== "false" ? "bg-primary" : "bg-surface-container-highest"
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            settings[P + k] !== "false" ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );

  return (
    <div className="flex flex-col xl:flex-row gap-6 min-h-0 flex-1">
      <div className="w-full xl:max-w-sm flex-shrink-0 flex flex-col gap-4 overflow-y-auto pb-4">
        <div className="flex rounded-2xl p-1 bg-surface-container-high gap-1">
          {subTabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              onClick={() => setBillType(tb.key)}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-bold transition ${
                billType === tb.key ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{tb.icon}</span>
              {tb.label}
            </button>
          ))}
        </div>

        <section className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 space-y-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">store</span>
            <h4 className="font-bold text-on-surface">{tt("Thông tin cửa hàng (chung)", "Gemeinsame Shop-Daten")}</h4>
          </div>
          {[
            { label: tt("Tên cửa hàng", "Shopname"), k: "store_name", ph: "Citrus POS" },
            { label: tt("Địa chỉ", "Adresse"), k: "store_address", ph: "…" },
            { label: tt("SĐT / Hotline", "Telefon"), k: "store_phone", ph: "…" },
          ].map(({ label, k, ph }) => (
            <div key={k} className="space-y-1">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{label}</label>
              <input
                value={settings[k] || ""}
                placeholder={ph}
                onChange={(e) => setSettings((s) => ({ ...s, [k]: e.target.value }))}
                className={inputCls}
              />
            </div>
          ))}
        </section>

        {billType !== "kitchen" && (
          <section className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 space-y-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">article</span>
              <h4 className="font-bold text-on-surface">{tt("Header bill / tạm tính", "Kopfzeile")}</h4>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {tt("MST, slogan… (chỉ bill & tạm tính)", "z.B. Steuernummer — nur Beleg & Proforma")}
            </p>
            <Field label={tt("Dòng thêm dưới header", "Zusatz unter Kopf")} k="extra_header" placeholder="VD: MST: …" type="textarea" />
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                {tt("Căn header", "Ausrichtung")}
              </label>
              <div className="flex gap-2">
                {[
                  ["left", tt("Trái", "Links")],
                  ["center", tt("Giữa", "Mitte")],
                  ["right", tt("Phải", "Rechts")],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set("header_align", v)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                      (get("header_align") || "center") === v
                        ? "bg-primary text-white border-primary"
                        : "border-outline-variant/50 text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 space-y-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary">text_fields</span>
            <h4 className="font-bold text-on-surface">{tt("Font (theo loại phiếu)", "Schrift pro Typ")}</h4>
          </div>
          <div>
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-2">
              {tt("Cỡ chữ (px)", "Größe px")}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={11}
                max={16}
                value={get("font_size") || "13"}
                onChange={(e) => set("font_size", e.target.value)}
                className="flex-1 accent-primary"
              />
              <span className="text-sm font-bold w-11 text-center py-1 rounded-lg bg-surface-container-high">{get("font_size") || "13"}px</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              {tt("Kiểu chữ", "Stil")}
            </label>
            <div className="flex gap-2">
              {[
                ["normal", tt("Thường", "Normal")],
                ["bold", tt("Đậm", "Fett")],
                ["italic", tt("Nghiêng", "Kursiv")],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set("font_style", v)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                    (get("font_style") || "normal") === v
                      ? "bg-primary text-white border-primary"
                      : "border-outline-variant/50 text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                  style={{ fontWeight: v === "bold" ? "bold" : "normal", fontStyle: v === "italic" ? "italic" : "normal" }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </section>

        {billType === "bill" && (
          <section className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">view_column</span>
              <h4 className="font-bold text-on-surface">{tt("Cột bảng (chỉ hóa đơn TT)", "Spalten nur Zahlungsbeleg")}</h4>
            </div>
            <Toggle label={tt("Hiện SL", "Menge")} k="show_qty" desc={tt("Cột số lượng", "Spalte Menge")} />
            <Toggle label={tt("Hiện đơn giá", "Einzelpreis")} k="show_unit_price" desc={tt("Cột đơn giá", "Spalte Preis")} />
          </section>
        )}

        <section className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 space-y-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-green-700">sticky_note_2</span>
            <h4 className="font-bold text-on-surface">
              {billType === "kitchen" ? tt("Ghi chú bếp (footer)", "Küchen-Notiz") : tt("Chân trang", "Fußzeile")}
            </h4>
          </div>
          <Field
            label={billType === "kitchen" ? tt("Ghi chú", "Notiz") : tt("Lời cảm ơn", "Dank") }
            k="footer"
            placeholder={
              billType === "kitchen" ? tt("VD: Ưu tiên bàn VIP", "z.B. VIP") : tt("Cảm ơn quý khách…", "Danke…")
            }
            type="textarea"
          />
          {billType !== "kitchen" && (
            <Field label={tt("Footer thêm", "Zusatz Fuß")} k="extra_footer" placeholder="…" type="textarea" />
          )}
        </section>

        <section className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-600">translate</span>
            <h4 className="font-bold text-on-surface">{tt("Ngôn ngữ giao diện", "UI-Sprache")}</h4>
          </div>
          <button
            type="button"
            onClick={toggleLanguage}
            className="w-full py-2.5 rounded-xl font-bold border border-outline-variant/50 hover:bg-surface-container-high transition text-on-surface"
          >
            {language === "de" ? "DE → VI" : "VI → DE"}
          </button>
        </section>

        <button
          type="button"
          onClick={saveAllSettings}
          className={`w-full py-3 rounded-xl font-bold text-white transition shadow-md ${
            settingsSaved ? "bg-green-600" : "bg-primary hover:opacity-95"
          }`}
        >
          {settingsSaved ? tt("Đã lưu", "Gespeichert") : tt("Lưu toàn bộ cài đặt", "Alle Einstellungen speichern")}
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="flex items-center gap-2 mb-3 flex-shrink-0 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-surface-container-high text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px] text-primary">visibility</span>
            {tt("Xem trước realtime", "Live-Vorschau")} — {subTabs.find((t) => t.key === billType)?.label}
          </span>
          <span className="text-xs text-on-surface-variant italic">
            {tt("Mẫu tiếng Việt (chỉ demo)", "Demo VI")}
          </span>
        </div>
        <div
          className="flex-1 overflow-y-auto rounded-2xl flex items-start justify-center py-6 px-4 bg-surface-container"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)",
            backgroundSize: "20px 20px",
          }}
        >
          <div className="shadow-2xl rounded-sm overflow-hidden" style={{ maxWidth: 320, width: "100%" }}>
            <BillPreview
              settings={settings}
              billType={billType}
              language={language}
              titleHint={`${reportBillCfg.font_size}px · ${reportBillCfg.font_style}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
