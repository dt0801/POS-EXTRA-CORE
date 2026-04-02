import React from "react";

export default function StatsView({
  formatMoney,
  statsTab,
  setStatsTab,
  statsMonth,
  setStatsMonth,
  fetchStatsMonthly,
  statsYear,
  setStatsYear,
  fetchStatsYearly,
  statsToday,
  statsMonthlyData,
  statsYearlyData,
  language = "vi",
}) {
  const fmt = formatMoney;
  const tr = (vi, de) => (language === "de" ? de : vi);
  const chartData = (() => {
    if (statsTab === "day") {
      return [{ label: tr("Hôm nay", "Heute"), value: Number(statsToday?.revenue || 0) }];
    }
    if (statsTab === "month") {
      return Array.isArray(statsMonthlyData?.days)
        ? statsMonthlyData.days.map((d) => ({ label: (d.date || "").slice(8, 10), value: Number(d.revenue || 0) }))
        : [];
    }
    return Array.isArray(statsYearlyData?.months)
      ? statsYearlyData.months.map((m) => ({ label: (m.month || "").slice(5, 7), value: Number(m.revenue || 0) }))
      : [];
  })();
  const maxValue = Math.max(1, ...chartData.map((d) => d.value));

  const renderKPIs = (title, revenue, bills, avg) => (
    <section className="grid grid-cols-2 gap-4">
      {/* Total Revenue - Hero Card */}
      <div className="col-span-2 bg-gradient-to-br from-primary to-primary-container p-6 rounded-[2rem] shadow-lg shadow-orange-500/20 text-white overflow-hidden relative">
        <div className="relative z-10">
          <p className="font-headline font-semibold text-orange-100/80 text-xs uppercase tracking-widest mb-1">{title}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-headline font-extrabold tracking-tighter">{fmt(revenue).replace(/đ/g, '')}</span>
            <span className="text-lg font-bold">đ</span>
          </div>
        </div>
        {/* Abstract Glass Circle Background */}
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
      </div>

      {/* Total Invoices */}
      <div className="bg-surface-container-lowest p-5 rounded-[1.5rem] flex flex-col justify-between shadow-sm">
        <div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-blue-600">receipt_long</span>
          </div>
          <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-1">{tr("Tổng hóa đơn", "Rechnungen gesamt")}</p>
          <p className="text-2xl font-headline font-bold text-on-surface">{bills}</p>
        </div>
      </div>

      {/* Average / Order */}
      <div className="bg-surface-container-lowest p-5 rounded-[1.5rem] flex flex-col justify-between shadow-sm">
        <div>
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-orange-600">analytics</span>
          </div>
          <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-1">{tr("Trung bình", "Durchschnitt")}</p>
          <p className="text-2xl font-headline font-bold text-on-surface">{avg}</p>
        </div>
      </div>
    </section>
  );

  return (
    <div className="p-4 md:p-8 flex flex-col w-full max-w-7xl mx-auto h-full overflow-y-auto pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 shrink-0">
        <div>
          <h2 className="font-headline font-extrabold text-3xl tracking-tight text-on-surface">{tr("Báo Cáo Doanh Thu", "Umsatzbericht")}</h2>
          <p className="text-on-surface-variant text-sm mt-1">{tr("Thống kê vận hành", "Betriebsstatistik")}</p>
        </div>
        
        {/* Tabs and Controllers */}
        <div className="flex bg-surface-container-highest rounded-xl p-1 gap-1 items-center shadow-inner overflow-x-auto hide-scrollbar w-full md:w-auto">
          {[["day", tr("Hôm nay", "Heute")], ["month", tr("Tháng", "Monat")], ["year", tr("Năm", "Jahr")]].map(([v, l]) => (
            <button 
              key={v} 
              onClick={() => setStatsTab(v)} 
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${statsTab === v ? "bg-white shadow-sm text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              {l}
            </button>
          ))}
          
          {statsTab === "month" && (
            <input 
              type="month" 
              value={statsMonth} 
              onChange={(e) => { setStatsMonth(e.target.value); fetchStatsMonthly(e.target.value); }} 
              className="ml-2 bg-transparent border-none text-sm font-bold text-on-surface-variant focus:ring-0 outline-none cursor-pointer hover:bg-white/50 px-2 py-1 rounded-lg transition-colors" 
            />
          )}

          {statsTab === "year" && (
            <select 
              value={statsYear} 
              onChange={(e) => { setStatsYear(e.target.value); fetchStatsYearly(e.target.value); }} 
              className="ml-2 bg-transparent border-none text-sm font-bold text-on-surface-variant focus:ring-0 outline-none cursor-pointer hover:bg-white/50 px-2 py-1 rounded-lg transition-colors appearance-none pr-6 font-mono"
            >
              {Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString()).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {statsTab === "day" && statsToday && renderKPIs(
        tr("Doanh thu hôm nay", "Umsatz heute"),
        statsToday.revenue,
        statsToday.bill_count,
        statsToday.bill_count ? fmt(Math.round(statsToday.revenue / statsToday.bill_count)) : "0đ"
      )}

      {statsTab === "month" && renderKPIs(
        tr("Doanh thu tháng", "Umsatz im Monat"),
        statsMonthlyData?.revenue ?? 0,
        statsMonthlyData?.bill_count ?? 0,
        statsMonthlyData?.days?.length ? fmt(Math.round(statsMonthlyData.revenue / statsMonthlyData.days.length)) : "0đ"
      )}

      {statsTab === "year" && renderKPIs(
        tr("Doanh thu năm", "Umsatz im Jahr"),
        statsYearlyData?.revenue ?? 0,
        statsYearlyData?.bill_count ?? 0,
        statsYearlyData?.months?.length ? fmt(Math.round(statsYearlyData.revenue / statsYearlyData.months.length)) : "0đ"
      )}

      <section className="mt-8 bg-surface-container-lowest p-6 rounded-[2rem] shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-headline font-bold text-lg">{tr("Biểu đồ hoạt động", "Aktivitätsdiagramm")}</h3>
          <span className="text-primary text-xs font-bold uppercase tracking-widest">{tr("Gần đây", "Neueste")}</span>
        </div>
        {chartData.length === 0 ? (
          <div className="h-32 flex items-center justify-center border-2 border-dashed border-outline-variant/30 rounded-xl relative overflow-hidden">
            <p className="text-on-surface-variant/50 text-sm font-semibold italic">{tr("Không có dữ liệu trong mốc thời gian này", "Keine Daten in diesem Zeitraum")}</p>
          </div>
        ) : (
          <div className="h-52 border border-outline-variant/20 rounded-xl p-3 bg-surface-container-low">
            <div className="h-full flex items-end gap-2">
              {chartData.map((d, idx) => {
                const heightPct = Math.max(6, Math.round((d.value / maxValue) * 100));
                return (
                  <div key={`${d.label}-${idx}`} className="flex-1 h-full flex flex-col justify-end items-center gap-2">
                    <div className="text-[10px] font-bold text-on-surface-variant">{d.value > 0 ? fmt(d.value) : "0đ"}</div>
                    <div className="w-full bg-primary/15 rounded-md overflow-hidden" style={{ height: "70%" }}>
                      <div
                        className="w-full bg-gradient-to-t from-primary to-orange-400 rounded-md transition-all"
                        style={{ height: `${heightPct}%`, marginTop: `${100 - heightPct}%` }}
                      />
                    </div>
                    <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{d.label || "-"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
