import React from "react";

export default function TablesView({
  tables,
  tableStatus,
  tableOrders,
  calcTotalQty,
  formatMoney,
  setCurrentTable,
  setSidebarView,
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
        <div>
          <span className="text-primary font-headline font-bold text-sm tracking-widest uppercase">Sơ đồ nhà hàng</span>
          <h2 className="text-4xl lg:text-5xl font-black font-headline text-on-surface mt-2">Quản lý Bàn</h2>
        </div>
        <div className="flex flex-wrap gap-4 mb-2">
          <div className="flex items-center gap-3 bg-surface-container-lowest px-5 py-2.5 rounded-2xl shadow-sm border border-outline-variant/30">
            <span className="w-4 h-4 rounded-full bg-slate-200"></span>
            <span className="text-sm font-bold text-on-surface-variant">Trống</span>
          </div>
          <div className="flex items-center gap-3 bg-gradient-to-br from-primary to-orange-500 px-5 py-2.5 rounded-2xl shadow-md border border-transparent shadow-orange-300/40">
            <span className="w-4 h-4 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"></span>
            <span className="text-sm font-bold text-white">Đang phục vụ</span>
          </div>
          <div className="flex items-center gap-3 bg-gradient-to-br from-purple-500 to-purple-600 px-5 py-2.5 rounded-2xl shadow-md border border-transparent shadow-purple-300/40">
            <span className="w-4 h-4 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"></span>
            <span className="text-sm font-bold text-white">Chờ dọn / Thanh toán</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 lg:gap-8 pb-12">
        {tables.map((t) => {
          const status = tableStatus[t] || "PAID";
          const qty = calcTotalQty(tableOrders[t]);
          const revenue = Object.values(tableOrders[t] || {}).reduce((sum, item) => sum + item.price * item.qty, 0);
          const isOccupied = status === "OPEN" || status === "ORDERING";
          const isPaying = status === "PAYING";

          return (
            <div
              key={t}
              onClick={() => {
                setCurrentTable(t);
                setSidebarView("order");
              }}
              className={`group relative rounded-2xl p-5 flex flex-col justify-between shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden aspect-[4/5]
                ${isOccupied ? "bg-white border border-stone-100" : isPaying ? "bg-white border-2 border-purple-100" : "bg-surface-container-low border border-stone-200/50 hover:bg-white opacity-80 hover:opacity-100"}`}
            >
              {isOccupied && <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-orange-600/5 rounded-full group-hover:scale-150 transition-transform duration-500"></div>}
              {isPaying && <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-purple-600/5 rounded-full"></div>}

              <div className="flex justify-between items-start z-10">
                <div className="flex flex-col">
                  <span className={`text-3xl font-black transition-colors ${isOccupied ? "text-stone-900 group-hover:text-primary" : isPaying ? "text-stone-900" : "text-stone-400 group-hover:text-stone-600"}`}>{t}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isOccupied ? "text-primary" : isPaying ? "text-purple-600" : "text-stone-400"}`}>
                    {isOccupied ? "Đang phục vụ" : isPaying ? "Chờ Dọn" : "Trống"}
                  </span>
                </div>
                {isOccupied ? (
                  <div className="bg-primary text-white px-2 py-1 rounded-lg text-[10px] font-black">{qty} MÓN</div>
                ) : isPaying ? (
                  <div className="bg-purple-600 text-white px-2 py-1 rounded-lg text-[10px] font-black uppercase">BILL IN</div>
                ) : (
                  <div className="text-stone-300">
                    <span className="material-symbols-outlined">event_seat</span>
                  </div>
                )}
              </div>

              {isOccupied || isPaying ? (
                <div className="flex flex-col gap-1 z-10 mt-auto">
                  <div className="flex justify-between items-center text-stone-400">
                    <span className="text-[11px] font-medium">{isOccupied ? "Tổng Bill" : "Khách thanh toán"}</span>
                    <span className="text-xs font-bold text-stone-700">{qty} món</span>
                  </div>
                  <div className={`text-2xl font-black tracking-tight ${isOccupied ? "text-stone-900" : "text-purple-600"}`}>
                    {formatMoney(revenue)}
                  </div>
                </div>
              ) : (
                <div className="mt-auto flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-stone-400 italic">Chưa có khách</span>
                  <div className="h-10 border-2 border-dashed border-stone-200/50 rounded-xl flex items-center justify-center text-[10px] font-bold text-stone-400 uppercase group-hover:border-primary/50 group-hover:text-primary transition-colors">
                    Chạm Mở Bàn
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
