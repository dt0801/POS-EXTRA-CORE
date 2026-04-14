import React from "react";

export default function HistoryView({
  historyDate,
  setHistoryDate,
  fetchBills,
  setSelectedBill,
  bills,
  selectedBill,
  fetchBillDetail,
  formatMoney,
  callPrintApi,
  onReprintBill,
  onDownloadBillPdf,
  language = "vi",
}) {
  const tr = (vi, de) => (language === "de" ? de : vi);
  const locale = language === "de" ? "de-DE" : "vi-VN";
  const totalCompleted = bills.length;
  const totalRevenue = bills.reduce((sum, b) => sum + (b.total || 0), 0);
  const paymentLabel = (pm) => {
    const v = String(pm || "").toUpperCase();
    if (v === "CARD") return tr("Thẻ / Card", "Karte / Card");
    if (v === "CASH") return tr("Tiền mặt", "Bar");
    return tr("Không rõ", "Unbekannt");
  };

  // If mobile and selectedBill, we show the detail screen overlay style
  const isMobileDetailVisible = !!selectedBill;

  return (
    <section className="flex flex-1 overflow-hidden w-full max-w-7xl mx-auto h-full relative">
      {/* 
        LIST VIEW (Screen 4)
        Hidden on mobile if detail is visible, otherwise full width. 
        On desktop, always visible taking up 2/5 width.
      */}
      <div className={`w-full md:w-2/5 flex flex-col h-full bg-surface-container ${isMobileDetailVisible ? "hidden md:flex" : "flex"}`}>
        <main className="px-4 md:px-6 pt-6 flex-1 overflow-y-auto pb-32">
          {/* Header & Date Filter */}
          <section className="mb-8 shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline font-bold text-2xl tracking-tight text-on-surface">{tr("Lịch sử Đơn hàng", "Bestellverlauf")}</h2>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-highest rounded-full text-on-surface-variant text-sm font-semibold relative cursor-pointer hover:bg-surface-variant transition-colors">
                <span className="material-symbols-outlined text-sm">calendar_today</span>
                <input 
                  type="date" 
                  value={historyDate} 
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    setHistoryDate(nextDate);
                    setSelectedBill(null);
                    if (typeof fetchBills === "function") fetchBills(nextDate);
                  }} 
                  className="absolute inset-0 opacity-0 cursor-pointer w-full" 
                />
                <span>{new Date(historyDate).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}</span>
              </div>
            </div>
            
            {/* Stats Overview */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-1 p-5 bg-surface-container-lowest shadow-sm rounded-3xl">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1">{tr("Tổng hóa đơn", "Rechnungen gesamt")}</p>
                <p className="font-headline font-extrabold text-2xl text-primary">{totalCompleted}</p>
                <p className="text-[10px] text-on-surface-variant/60 mt-1">{tr("Đơn đã hoàn tất", "Abgeschlossene Bestellungen")}</p>
              </div>
              <div className="col-span-1 p-5 bg-surface-container-lowest shadow-sm rounded-3xl">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1">{tr("Doanh thu", "Umsatz")}</p>
                <p className="font-headline font-extrabold text-2xl text-on-surface">{formatMoney(totalRevenue).replace(/đ/g, '')} đ</p>
                <p className="text-[10px] text-on-surface-variant/60 mt-1">VND • {new Date(historyDate).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}</p>
              </div>
            </div>
          </section>

          {/* Orders List */}
          <div className="space-y-4">
            {bills.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center opacity-30">
                <span className="material-symbols-outlined text-4xl mb-2">inventory_2</span>
                <p className="text-xs font-semibold uppercase tracking-widest">{tr("Không có đơn hàng", "Keine Bestellungen")}</p>
              </div>
            ) : (
              bills.map((b) => {
                const isSelected = selectedBill?.id === b.id;
                return (
                  <div 
                    key={b.id} 
                    onClick={() => fetchBillDetail(b.id)} 
                    className={`group p-5 rounded-3xl flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all duration-200 
                      ${isSelected ? "bg-primary-container text-on-primary-container ring-2 ring-primary border-transparent shadow-md" : "bg-surface-container-lowest border border-transparent hover:border-outline-variant/30 shadow-sm"}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isSelected ? "bg-white/20 text-on-primary-container" : "bg-orange-50 text-orange-600"}`}>
                        <span className="material-symbols-outlined">table_restaurant</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-headline font-bold text-lg ${isSelected ? "text-on-primary-container" : "text-on-surface"}`}>{tr("Bàn", "Tisch")} {b.table_num}</span>
                          <span className="w-1 h-1 bg-stone-300 rounded-full"></span>
                          <span className={`text-sm font-medium ${isSelected ? "text-on-primary-container/80" : "text-on-surface-variant"}`}>#HD-{b.id}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-medium flex items-center gap-1 ${isSelected ? "text-on-primary-container/80" : "text-stone-400"}`}>
                            <span className="material-symbols-outlined text-[14px]">schedule</span> 
                            {new Date(b.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isSelected ? "bg-white/20 text-on-primary-container" : "bg-green-100 text-green-700"}`}>{tr("Hoàn tất", "Abgeschlossen")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-headline font-bold text-lg ${isSelected ? "text-on-primary-container" : "text-on-surface"}`}>{formatMoney(b.total)}</p>
                      <span className={`material-symbols-outlined text-sm ${isSelected ? "text-on-primary-container/50" : "text-stone-300"}`}>chevron_right</span>
                    </div>
                  </div>
                );
              })
            )}

            {bills.length > 0 && (
              <div className="py-8 flex flex-col items-center justify-center opacity-30 mt-4 border-t border-dashed border-outline-variant/20">
                <p className="text-[10px] font-semibold uppercase tracking-widest">{tr("Hết danh sách", "Ende der Liste")}</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* 
        DETAIL VIEW (Screen 5)
        Always shows on desktop (md:flex). 
        Shows on mobile ONLY IF there's a selected bill (absolute covering everything).
      */}
      <div className={`${isMobileDetailVisible ? "flex absolute inset-0 z-40 bg-surface-container" : "hidden"} md:relative md:flex w-full md:w-3/5 flex-col bg-surface-container md:bg-surface-container-low overflow-hidden h-full`}>
        {selectedBill ? (
          <div className="flex flex-col h-full overflow-hidden relative">
            {/* Mobile Header with Back button */}
            <header className="md:hidden sticky top-0 w-full z-10 bg-orange-50/90 backdrop-blur-xl shadow-sm px-4 py-3 shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedBill(null)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-orange-600 shadow-sm active:scale-95">
                  <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h1 className="font-headline font-bold text-xl text-orange-600">{tr("HD", "RE")}: #{selectedBill.id}</h1>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-32 space-y-6">
              {/* Hero Section: Table Identity */}
              <section className="relative h-40 md:h-48 rounded-[2rem] overflow-hidden bg-surface-container-lowest shadow-sm border border-outline-variant/30">
                <div className="absolute inset-0 bg-primary/5 flex items-center justify-center pointer-events-none">
                  <span className="material-symbols-outlined text-9xl text-primary/10 -rotate-12 translate-x-12">receipt_long</span>
                </div>
                <div className="relative h-full flex flex-col justify-end p-6">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-secondary font-semibold uppercase tracking-widest text-[10px] mb-1">{tr("Bàn gọi món", "Bestellter Tisch")}</p>
                      <h2 className="font-headline font-extrabold text-4xl text-on-surface">{tr("Bàn", "Tisch")} {selectedBill.table_num}</h2>
                    </div>
                    <div className="text-right">
                      <p className="text-on-surface-variant font-medium text-sm">{new Date(selectedBill.created_at).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })}</p>
                      <p className="text-on-surface-variant font-bold text-lg">{new Date(selectedBill.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Bill Details Grid */}
              <div className="bg-surface-container-lowest rounded-[2rem] p-6 space-y-8 shadow-sm border border-outline-variant/30">
                <div className="flex items-center justify-between border-b border-surface-container-highest pb-4">
                  <h3 className="font-headline font-bold text-xl">{tr("Danh sách món", "Gerichteliste")}</h3>
                  <span className="bg-secondary-container/20 text-on-secondary-container px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">{tr("Đã hoàn tất", "Abgeschlossen")}</span>
                </div>
                
                {/* Items List */}
                <div className="space-y-4">
                  {(selectedBill.items || []).map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between group border-b border-surface-container pb-4 last:border-0 last:pb-0">
                      <div className="flex-1 pr-4">
                        <h4 className="font-bold text-on-surface text-base leading-tight break-words">{item.name}</h4>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="bg-surface-container-high px-2 py-0.5 rounded text-[11px] font-bold text-on-surface-variant">{tr("SL", "Menge")}: {item.qty}</span>
                          <span className="text-on-surface-variant text-xs">{formatMoney(item.price)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-headline font-bold text-base whitespace-nowrap">{formatMoney(item.price * item.qty)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Calculation Tonal Layer */}
                <div className="bg-surface-container-low rounded-2xl p-5 space-y-3 border border-outline-variant/20 mt-6 mt-8">
                  <div className="flex justify-between text-sm text-on-surface-variant font-medium">
                    <span>{tr("Tổng tạm", "Zwischensumme")}</span>
                    <span>{formatMoney(selectedBill.total)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-on-surface-variant font-medium">
                    <span>VAT (0%)</span>
                    <span>0đ</span>
                  </div>
                  <div className="pt-3 flex justify-between items-baseline border-t border-dashed border-outline-variant/30">
                    <span className="font-headline font-extrabold text-on-surface">{tr("Thành tiền", "Gesamtbetrag")}</span>
                    <span className="font-headline font-extrabold text-3xl text-primary">{formatMoney(selectedBill.total)}</span>
                  </div>
                </div>
              </div>

              {/* Additional Info Chips */}
              <div className="flex flex-wrap gap-2 pb-16 md:pb-0">
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-outline-variant/20">
                  <span className="material-symbols-outlined text-sm text-secondary">tag</span>
                  <span className="text-xs font-bold text-on-surface-variant">{tr("Mã HD", "RE-Code")}: {selectedBill.id}</span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-outline-variant/20">
                  <span className="material-symbols-outlined text-sm text-secondary">payments</span>
                  <span className="text-xs font-bold text-on-surface-variant">{paymentLabel(selectedBill.payment_method)}</span>
                </div>
              </div>
            </div>

            {/* Fixed Footer Action */}
            <div className="absolute bottom-0 w-full z-20 bg-white/95 backdrop-blur-md rounded-t-[2.5rem] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] border-t border-outline-variant/10">
              <div className="px-6 pt-5 pb-8 mb-safe md:pb-6 flex flex-col gap-3">
                {typeof onDownloadBillPdf === "function" && (
                  <button
                    type="button"
                    onClick={() => onDownloadBillPdf(selectedBill)}
                    className="w-full h-12 md:h-14 rounded-[1.25rem] font-headline font-bold text-base border-2 border-primary text-primary bg-white hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined">picture_as_pdf</span>
                    {tr("Tải PDF", "PDF herunterladen")}
                  </button>
                )}
                <button 
                  onClick={async () => { 
                    if (typeof onReprintBill === "function") {
                      try {
                        await onReprintBill(selectedBill);
                      } catch (err) {
                        alert(err.message || tr("Không thể in lại hóa đơn", "Rechnung kann nicht erneut gedruckt werden"));
                      }
                      return;
                    }
                    try { 
                      await callPrintApi(`/print/bill/${selectedBill.id}`, {}); 
                    } catch (err) { 
                      alert(err.message || tr("Không thể in lại hóa đơn", "Rechnung kann nicht erneut gedruckt werden")); 
                    } 
                  }} 
                  className="w-full h-14 md:h-16 bg-gradient-to-br from-primary to-primary-container text-white rounded-[1.5rem] font-headline font-extrabold text-lg md:text-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>print</span>
                  {tr("In lại Hóa đơn", "Rechnung erneut drucken")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant/40 p-8">
            <span className="material-symbols-outlined text-6xl mb-4 opacity-50">receipt_long</span>
            <p className="text-lg font-medium">{tr("Chọn một hóa đơn để xem chi tiết", "Wählen Sie eine Rechnung für Details")}</p>
          </div>
        )}
      </div>
    </section>
  );
}

