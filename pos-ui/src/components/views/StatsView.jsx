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
}) {
  const fmt = formatMoney;
  const kpiCls = "p-6 rounded-[2rem] shadow-sm border border-outline-variant/20";

  return (
    <div className="p-4 md:p-8 flex flex-col w-full max-w-7xl mx-auto h-full overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 shrink-0">
        <div>
          <span className="text-primary font-headline font-bold text-sm tracking-widest uppercase">Thống kê vận hành</span>
          <h3 className="text-3xl font-headline font-extrabold text-on-surface mt-1">Báo Cáo Doanh Thu</h3>
        </div>
        <div className="flex bg-surface-container-highest rounded-xl p-1 gap-1 items-center shadow-inner">
          {[["day", "Hôm nay"], ["month", "Tháng"], ["year", "Năm"]].map(([v, l]) => (
            <button key={v} onClick={() => setStatsTab(v)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${statsTab === v ? "bg-white shadow-sm text-primary" : "text-on-surface-variant hover:text-on-surface"}`}>{l}</button>
          ))}
          {statsTab === "month" && <input type="month" value={statsMonth} onChange={(e) => { setStatsMonth(e.target.value); fetchStatsMonthly(e.target.value); }} className="ml-2 bg-transparent border-none text-sm font-bold text-on-surface-variant focus:ring-0 outline-none cursor-pointer hover:bg-white/50 px-2 py-1 rounded-lg transition-colors" />}
          {statsTab === "year" && <select value={statsYear} onChange={(e) => { setStatsYear(e.target.value); fetchStatsYearly(e.target.value); }} className="ml-2 bg-transparent border-none text-sm font-bold text-on-surface-variant focus:ring-0 outline-none cursor-pointer hover:bg-white/50 px-2 py-1 rounded-lg transition-colors appearance-none pr-6 font-mono">{Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString()).map((y) => <option key={y} value={y}>{y}</option>)}</select>}
        </div>
      </div>

      {statsTab === "day" && statsToday && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className={`${kpiCls} bg-gradient-to-br from-primary to-primary-container text-white`}><p className="text-xs uppercase font-bold">Doanh thu hôm nay</p><h4 className="text-4xl font-black mt-2">{fmt(statsToday.revenue)}</h4></div>
          <div className={`${kpiCls} bg-surface-container-lowest`}><p className="text-xs uppercase font-bold text-on-surface-variant">Tổng hóa đơn</p><h4 className="text-4xl font-black mt-2">{statsToday.bill_count}</h4></div>
          <div className={`${kpiCls} bg-surface-container-lowest`}><p className="text-xs uppercase font-bold text-on-surface-variant">Trung bình/HĐ</p><h4 className="text-4xl font-black mt-2">{statsToday.bill_count ? fmt(Math.round(statsToday.revenue / statsToday.bill_count)) : "0đ"}</h4></div>
        </div>
      )}

      {statsTab === "month" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className={`${kpiCls} bg-gradient-to-br from-primary to-primary-container text-white`}><p className="text-xs uppercase font-bold">Doanh thu tháng</p><h4 className="text-4xl font-black mt-2">{fmt(statsMonthlyData?.revenue ?? 0)}</h4></div>
          <div className={`${kpiCls} bg-surface-container-lowest`}><p className="text-xs uppercase font-bold text-on-surface-variant">Hóa đơn tháng</p><h4 className="text-4xl font-black mt-2">{statsMonthlyData?.bill_count ?? "0"}</h4></div>
          <div className={`${kpiCls} bg-surface-container-lowest`}><p className="text-xs uppercase font-bold text-on-surface-variant">Trung bình ngày</p><h4 className="text-4xl font-black mt-2">{statsMonthlyData?.days?.length ? fmt(Math.round(statsMonthlyData.revenue / statsMonthlyData.days.length)) : "0đ"}</h4></div>
        </div>
      )}

      {statsTab === "year" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className={`${kpiCls} bg-gradient-to-br from-primary to-primary-container text-white`}><p className="text-xs uppercase font-bold">Doanh thu năm</p><h4 className="text-4xl font-black mt-2">{fmt(statsYearlyData?.revenue ?? 0)}</h4></div>
          <div className={`${kpiCls} bg-surface-container-lowest`}><p className="text-xs uppercase font-bold text-on-surface-variant">Hóa đơn cả năm</p><h4 className="text-4xl font-black mt-2">{statsYearlyData?.bill_count ?? "0"}</h4></div>
          <div className={`${kpiCls} bg-surface-container-lowest`}><p className="text-xs uppercase font-bold text-on-surface-variant">Trung bình tháng</p><h4 className="text-4xl font-black mt-2">{statsYearlyData?.months?.length ? fmt(Math.round(statsYearlyData.revenue / statsYearlyData.months.length)) : "0đ"}</h4></div>
        </div>
      )}
    </div>
  );
}
