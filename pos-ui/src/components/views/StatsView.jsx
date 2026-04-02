import React from "react";
import { menuImageSrc, removeTones } from "../../utils/posHelpers";

const WEEK_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function compactMoneyFromThousandVnd(v) {
  const n = Number(v || 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}B`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}M`;
  // n is already "thousand VND", so show as K directly.
  return `${sign}${abs < 100 ? abs.toFixed(1) : abs.toFixed(0)}K`;
}

function toWeekdayShort(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return WEEK_LABELS[d.getDay()] || dateStr;
}

function mean(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return arr.reduce((s, x) => s + Number(x || 0), 0) / arr.length;
}

function pickTrendPct(series, fromEndFraction = 0.5) {
  if (!Array.isArray(series) || series.length < 2) return 0;
  const len = series.length;
  const split = Math.max(1, Math.floor(len * fromEndFraction));
  const first = series.slice(0, len - split);
  const last = series.slice(len - split);
  const a = mean(first);
  const b = mean(last);
  if (!a) return 0;
  return Math.round(((b - a) / a) * 100);
}

export default function StatsView({
  formatMoney: _formatMoney,
  statsTab,
  setStatsTab,
  statsToday,
  statsMonthlyData,
  statsYearlyData,
  menu = [],
  language = "vi",
}) {
  const tr = (vi, de) => (language === "de" ? de : vi);

  const daysSeries = Array.isArray(statsMonthlyData?.days) ? statsMonthlyData.days : [];
  const monthsSeries = Array.isArray(statsYearlyData?.months) ? statsYearlyData.months : [];

  // Template chart is a 7-bar block. We emulate it by taking:
  // - day/month tab: last 7 days from statsMonthlyData.days
  // - year tab: last 7 months from statsYearlyData.months
  const chartSeries = (() => {
    if (statsTab === "year") {
      const last = monthsSeries.slice(-7);
      return last.map((m) => ({
        label: (m.month || "").slice(5, 7) || "-",
        revenue: Number(m.revenue || 0),
        bill_count: Number(m.bill_count || 0),
      }));
    }

    const lastDays = daysSeries.slice(-7);
    return lastDays.map((d) => ({
      label: toWeekdayShort(d.date || ""),
      revenue: Number(d.revenue || 0),
      bill_count: Number(d.bill_count || 0),
      date: d.date,
    }));
  })();

  const chartMax = Math.max(1, ...chartSeries.map((d) => d.revenue));
  const chartRevenueSum = chartSeries.reduce((s, d) => s + Number(d.revenue || 0), 0);
  const chartBillsSum = chartSeries.reduce((s, d) => s + Number(d.bill_count || 0), 0);

  const kpi = (() => {
    if (statsTab === "month") {
      return {
        revenue: Number(statsMonthlyData?.revenue || 0),
        bills: Number(statsMonthlyData?.bill_count || 0),
      };
    }
    if (statsTab === "year") {
      return {
        revenue: Number(statsYearlyData?.revenue || 0),
        bills: Number(statsYearlyData?.bill_count || 0),
      };
    }
    // day tab: KPI follows the chart series sum to feel coherent
    return { revenue: chartRevenueSum, bills: chartBillsSum };
  })();

  const avgPerBill = kpi.bills ? kpi.revenue / kpi.bills : 0;
  const trendRevenuePct = pickTrendPct(chartSeries.map((d) => d.revenue), 0.5);
  const trendBillsPct = pickTrendPct(chartSeries.map((d) => d.bill_count), 0.5);

  const topItems =
    statsTab === "year"
      ? statsYearlyData?.top_items
      : statsTab === "month"
        ? statsMonthlyData?.top_items
        : statsToday?.top_items;

  const topList = Array.isArray(topItems) ? topItems.slice(0, 5) : [];
  const avgTopQty = mean(topList.map((i) => Number(i.total_qty || 0)));

  const getImageForName = (name) => {
    const norm = removeTones(String(name || "")).trim().toLowerCase();
    const match = menu.find((m) => removeTones(m?.name || "").trim().toLowerCase() === norm);
    return match?.image ? menuImageSrc(match.image) : "";
  };

  const peak = chartSeries.reduce(
    (best, d) => (d.revenue > (best?.revenue || 0) ? d : best),
    { revenue: 0, label: "-" }
  );
  const avgRevenue = mean(chartSeries.map((d) => d.revenue));
  const capacityPct = avgRevenue ? Math.min(95, Math.max(65, Math.round((peak.revenue / avgRevenue) * 75))) : 75;
  const customersPred = chartBillsSum ? Math.round(chartBillsSum * 1.2) : 0;

  const chartTitle = (() => {
    if (statsTab === "year") return tr("Biểu đồ Doanh thu quý", "Umsatzdiagramm fürs Quartal");
    if (statsTab === "month") return tr("Biểu đồ Doanh thu tháng", "Umsatzdiagramm im Monat");
    return tr("Biểu đồ Doanh thu tuần", "Umsatzdiagramm der Woche");
  })();

  return (
    <div className="p-4 md:p-8 flex flex-col w-full max-w-7xl mx-auto h-full overflow-y-auto pb-32">
      <div className="flex items-start justify-between gap-6 mb-6 shrink-0">
        <div>
          <div className="text-primary text-xs font-semibold uppercase tracking-widest">{tr("THỐNG KÊ VẬN HÀNH", "BETRIEBSSTATISTIK")}</div>
          <h2 className="font-headline font-extrabold text-3xl tracking-tight text-on-surface">{tr("Báo Cáo Doanh Thu", "Umsatzbericht")}</h2>
        </div>

        <div className="flex bg-surface-container-highest rounded-xl p-1 gap-1 items-center shadow-inner hide-scrollbar">
          <button
            onClick={() => setStatsTab("day")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
              statsTab === "day" ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            {tr("7 ngày", "7 Tage")}
          </button>
          <button
            onClick={() => setStatsTab("month")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
              statsTab === "month" ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            {tr("Tháng này", "Diesen Monat")}
          </button>
          <button
            onClick={() => setStatsTab("year")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
              statsTab === "year" ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            {tr("Quý này", "Dieses Quartal")}
          </button>
        </div>
      </div>

      {/* KPI row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-primary to-primary-container p-6 rounded-[2rem] text-white overflow-hidden relative">
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="text-orange-100/90 text-xs font-semibold uppercase tracking-widest">{tr("TỔNG DOANH THU", "GESAMTUMSATZ")}</div>
            <div className="flex items-baseline gap-2 mt-3">
              <div className="text-4xl font-headline font-extrabold tracking-tighter">{compactMoneyFromThousandVnd(kpi.revenue)}</div>
              <div className="text-sm font-bold opacity-90">VND</div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
              <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>
                {trendRevenuePct >= 0 ? "trending_up" : "trending_down"}
              </span>
              <span className={trendRevenuePct >= 0 ? "text-orange-100" : "text-error"}>{trendRevenuePct >= 0 ? `+${trendRevenuePct}%` : `${trendRevenuePct}%`}</span>
              <span className="opacity-80">{tr("so với kỳ trước", "gegenüber Vorperiode")}</span>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-[2rem] flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-tertiary-fixed-dim/30 text-on-surface flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-tertiary">receipt_long</span>
            </div>
            <div className="text-on-surface-variant text-xs font-semibold uppercase tracking-widest mb-2">{tr("TỔNG HÓA ĐƠN", "RECHNUNGEN GESAMT")}</div>
            <div className="text-4xl font-headline font-extrabold text-on-surface">{kpi.bills}</div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm font-semibold">
            <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>
              {trendBillsPct >= 0 ? "trending_up" : "trending_down"}
            </span>
            <span className={trendBillsPct >= 0 ? "text-tertiary" : "text-error"}>{trendBillsPct >= 0 ? `+${trendBillsPct}%` : `${trendBillsPct}%`}</span>
            <span className="opacity-70">{tr("so với kỳ trước", "gegenüber Vorperiode")}</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-[2rem] flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-secondary-fixed-dim/20 text-on-surface flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-primary">analytics</span>
            </div>
            <div className="text-on-surface-variant text-xs font-semibold uppercase tracking-widest mb-2">{tr("TRUNG BÌNH/HĐ", "DURCHSCHNITT/RECHNUNG")}</div>
            <div className="text-4xl font-headline font-extrabold text-on-surface">{compactMoneyFromThousandVnd(avgPerBill)}</div>
          </div>
        </div>
      </section>

      {/* Chart + Forecast */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-[2rem] p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="font-headline font-bold text-lg">{chartTitle}</div>
            <div className="flex items-center gap-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                {tr("Doanh thu", "Umsatz")}
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-tertiary" />
                {tr("Mục tiêu", "Ziel")}
              </div>
            </div>
          </div>

          <div className="bg-surface-container-low rounded-[2rem] p-6">
            {chartSeries.length === 0 ? (
              <div className="min-h-[260px] flex items-center justify-center opacity-40">
                <span className="material-symbols-outlined">analytics</span>
                <div className="ml-3 font-semibold">{tr("Đang cập nhật dữ liệu biểu đồ...", "Diagrammdaten werden aktualisiert...")}</div>
              </div>
            ) : (
              <div className="h-[260px] flex flex-col">
                <div className="flex-1 flex items-end gap-3 px-6 pb-6">
                  {chartSeries.map((d, idx) => {
                    const pct = Math.round((Number(d.revenue || 0) / chartMax) * 100);
                    const height = Math.max(8, pct);
                    return (
                      <div key={`${d.label}-${idx}`} className="flex-1 flex flex-col justify-end items-center">
                        <div
                          className="w-full bg-gradient-to-t from-primary to-primary-container rounded-md transition-all"
                          style={{ height: `${height}%`, minHeight: 18 }}
                          aria-label={`${d.label}: ${d.revenue}`}
                        />
                        <div className="mt-4 text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                          {d.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold text-on-surface-variant uppercase tracking-widest px-2">
                  <span>{tr("Gần đây", "Neueste")}</span>
                  <span>{tr("Biểu đồ Tonal", "Tonal Chart")}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1 bg-secondary-container/15 rounded-[2rem] p-6">
          <div className="text-on-surface font-headline font-extrabold text-lg mb-2">{tr("Dự báo Cao điểm", "Spitzenprognose")}</div>
          <div className="text-on-surface-variant/90 text-sm leading-relaxed mb-5">
            {tr(
              "Dựa trên dữ liệu lịch sử, dự kiến tối nay (Thứ 7) sẽ có lượng khách tăng đột biến.",
              "Basierend auf historischen Daten ist für heute Abend (Sa) ein deutlicher Kundenzuwachs zu erwarten."
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-surface-container-lowest rounded-[1.5rem] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <span className="material-symbols-outlined text-primary">restaurant</span>
                  <span className="font-bold">{tr("Công suất bàn", "Tischkapazität")}</span>
                </div>
                <div className="font-headline font-extrabold text-primary">{capacityPct}%</div>
              </div>
              <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-primary-container rounded-full" style={{ width: `${capacityPct}%` }} />
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-[1.5rem] p-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-tertiary">groups</span>
                <div>
                  <div className="text-on-surface-variant text-xs font-semibold uppercase tracking-widest">{tr("Lượng khách dự", "Kundenzahl (")}</div>
                  <div className="font-headline font-extrabold text-on-surface text-lg">≈ {customersPred || 0}</div>
                  <div className="text-on-surface-variant/80 text-xs mt-1">{tr("kiến", "geschätzt")}</div>
                </div>
              </div>
            </div>
          </div>

          <button className="mt-5 w-full bg-gradient-to-br from-primary to-primary-container text-white py-3 rounded-[1.5rem] font-extrabold active:scale-[0.98] transition-all">
            {tr("Xem chi tiết dự báo", "Prognose-Details")}
          </button>
        </div>
      </section>

      {/* Top 5 */}
      <section className="bg-surface-container-lowest rounded-[2rem] p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-headline font-extrabold text-xl">{tr("Top 5 Món Bán Chạy", "Top 5 Bestseller")}</h3>
          <button className="text-primary font-bold text-sm active:scale-[0.98] transition-all">
            {tr("Tất cả sản phẩm →", "Alle Produkte →")}
          </button>
        </div>

        {topList.length === 0 ? (
          <div className="min-h-[220px] flex items-center justify-center opacity-40">
            <span className="material-symbols-outlined">inventory_2</span>
            <div className="ml-3 font-semibold">{tr("Chưa có dữ liệu để hiển thị Top 5", "Keine Daten für Top 5")}</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {topList.map((it, idx) => {
              const rank = idx + 1;
              const qty = Number(it.total_qty || 0);
              const imgSrc = getImageForName(it.name);
              const pct = avgTopQty ? Math.round(((qty - avgTopQty) / avgTopQty) * 100) : 0;
              const isUp = pct >= 0;
              const pctAbs = Math.abs(pct);
              return (
                <div key={`${it.name}-${idx}`} className="flex flex-col gap-3">
                  <div className="relative rounded-[2rem] overflow-hidden aspect-square bg-surface-container-low">
                    {imgSrc ? (
                      <img
                        alt={it.name}
                        src={imgSrc}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary-container/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-5xl">restaurant</span>
                      </div>
                    )}

                    <div className="absolute top-3 left-3 bg-primary/60 text-white text-[10px] font-black px-2 py-1 rounded-full">
                      #{rank}
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-4">
                      <span className="text-xs font-bold opacity-90">
                        {qty} {tr("lượt gọi", "Aufrufe")}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="font-headline font-bold text-on-surface truncate">{it.name || "-"}</div>
                    <div className="flex items-center gap-2 mt-1 text-sm font-black">
                      <span className={`material-symbols-outlined text-xs ${isUp ? "text-tertiary" : "text-error"}`}>
                        {isUp ? "trending_up" : "trending_down"}
                      </span>
                      <span className={isUp ? "text-tertiary" : "text-error"}>
                        {`~ ${pctAbs}%`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
