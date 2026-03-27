import React from "react";

export default function HistoryView({
  historyDate,
  setHistoryDate,
  setSelectedBill,
  bills,
  selectedBill,
  fetchBillDetail,
  formatMoney,
  callPrintApi,
}) {
  return (
    <section className="flex flex-1 overflow-hidden p-2 md:p-6 gap-4 md:gap-8 w-full max-w-7xl mx-auto h-full">
      <div className="w-full md:w-2/5 flex flex-col gap-6 h-full">
        <div className="bg-surface-container-lowest rounded-xl p-5 flex flex-col gap-4 shrink-0 shadow-sm border border-outline-variant/30">
          <div className="flex items-center justify-between">
            <span className="font-headline font-bold text-on-surface">Bộ lọc ngày</span>
            <div className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-lg text-sm font-medium text-on-surface-variant relative cursor-pointer hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined text-base">calendar_today</span>
              <input type="date" value={historyDate} onChange={(e) => { setHistoryDate(e.target.value); setSelectedBill(null); }} className="absolute inset-0 opacity-0 cursor-pointer w-full" />
              <span>{new Date(historyDate).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 pb-8 space-y-4">
          {bills.length === 0 ? (
            <div className="text-center py-12 text-on-surface-variant/50 flex flex-col items-center">
              <span className="material-symbols-outlined text-4xl mb-2">receipt_long</span>
              <p>Không có hóa đơn nào</p>
            </div>
          ) : bills.map((b) => (
            <div key={b.id} onClick={() => fetchBillDetail(b.id)} className={`p-5 rounded-xl transition-all cursor-pointer group ${selectedBill?.id === b.id ? "bg-surface-container-lowest border-l-8 border-primary ring-1 ring-primary-container/20 shadow-md" : "bg-surface-container hover:bg-surface-container-lowest border border-transparent hover:border-outline-variant/30"}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className={`font-headline font-bold transition-colors ${selectedBill?.id === b.id ? "text-on-surface font-extrabold text-lg" : "text-on-surface group-hover:text-primary"}`}>#HD-{b.id}</h3>
                  <p className="text-xs text-on-surface-variant font-medium">Bàn {b.table_num} • {new Date(b.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <span className={`font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-tighter ${selectedBill?.id === b.id ? "bg-primary-container/20 text-primary" : "bg-surface-container-highest text-on-surface-variant"}`}>Đã thanh toán</span>
              </div>
              <div className="flex justify-between items-end mt-4">
                <span className="text-xs text-on-surface-variant font-medium truncate max-w-[150px]">{b.items_summary || "Không có tóm tắt"}</span>
                <span className={`font-headline text-lg font-bold ${selectedBill?.id === b.id ? "text-on-surface font-black" : "text-on-surface-variant"}`}>{formatMoney(b.total)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden md:flex w-3/5 flex-col bg-surface-container-lowest rounded-[2rem] shadow-sm border border-outline-variant/30 overflow-hidden h-full">
        {selectedBill ? (
          <>
            <div className="p-8 border-b border-surface-container bg-surface-bright shrink-0">
              <span className="font-headline text-xs font-bold text-primary uppercase tracking-widest block mb-1">Chi tiết hóa đơn</span>
              <h2 className="font-headline text-3xl font-black text-on-surface">Mã HD: #{selectedBill.id}</h2>
              <p className="text-sm text-on-surface-variant font-medium mt-1">Bàn {selectedBill.table_num} • {new Date(selectedBill.created_at).toLocaleString("vi-VN")}</p>
            </div>
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <table className="w-full text-left">
                <thead><tr className="text-[11px] font-black text-on-surface-variant uppercase tracking-[0.15em] border-b border-surface-container-highest"><th className="pb-4 pt-2 font-black">Tên món</th><th className="pb-4 pt-2 text-center w-16 font-black">SL</th><th className="pb-4 pt-2 text-right w-24 font-black">Đơn giá</th><th className="pb-4 pt-2 text-right w-28 font-black">Thành tiền</th></tr></thead>
                <tbody className="divide-y divide-surface-container-low">
                  {(selectedBill.items || []).map((item, i) => (
                    <tr key={i}><td className="py-4"><span className="font-bold text-on-surface block">{item.name}</span></td><td className="py-4 text-center font-bold text-on-surface-variant">{item.qty < 10 ? `0${item.qty}` : item.qty}</td><td className="py-4 text-right font-medium text-on-surface-variant">{formatMoney(item.price)}</td><td className="py-4 text-right font-headline font-bold text-on-surface">{formatMoney(item.price * item.qty)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-8 bg-surface-container shrink-0 rounded-t-3xl border-t border-outline-variant/20">
              <div className="flex justify-between items-baseline mb-6"><span className="font-headline text-lg font-bold text-on-surface">Tổng cộng</span><span className="font-headline text-4xl font-black text-primary">{formatMoney(selectedBill.total)}</span></div>
              <button onClick={async () => { try { await callPrintApi(`/print/bill/${selectedBill.id}`, {}); } catch (err) { alert(err.message || "Không thể in lại hóa đơn"); } }} className="w-full bg-gradient-to-br from-primary to-primary-container hover:from-orange-600 hover:to-orange-500 text-on-primary py-4 rounded-xl font-headline font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[20px]">print</span>In lại hóa đơn
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant/50 p-8"><span className="material-symbols-outlined text-6xl mb-4 opacity-20">receipt_long</span><p className="text-lg font-medium">Chọn một hóa đơn để xem chi tiết</p></div>
        )}
      </div>
    </section>
  );
}
