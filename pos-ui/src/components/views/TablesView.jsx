import React, { useState } from "react";

export default function TablesView({
  tables,
  tableStatus,
  tableOrders,
  calcTotalQty,
  formatMoney,
  setCurrentTable,
  setSidebarView,
}) {
  const [filter, setFilter] = useState("ALL");

  const totalTables = tables.length;
  const emptyTables = tables.filter(t => !tableStatus[t] || tableStatus[t] === "OPEN").length;
  const servingTables = tables.filter(t => tableStatus[t] === "ORDERING").length;
  const cleaningTables = tables.filter(t => tableStatus[t] === "PAYING").length;

  return (
    <div className="flex-1 overflow-y-auto pt-6 px-4 md:px-6 pb-32">
      {/* Section Header */}
      <div className="flex items-end justify-between mb-6">
        <h2 className="font-headline font-extrabold text-3xl tracking-tight text-on-surface">Quản lý Bàn</h2>
        <div className="flex gap-2">
          <span className="bg-surface-container-highest text-on-surface-variant px-3 py-1 rounded-full text-xs font-bold">TẦNG 1</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-4 hide-scrollbar">
        <button 
          onClick={() => setFilter("ALL")}
          className={`whitespace-nowrap px-5 py-2.5 rounded-full transition-colors ${filter === "ALL" ? "bg-primary-container text-on-primary-container font-bold shadow-sm" : "bg-surface-container-lowest text-on-surface-variant font-semibold hover:bg-surface-bright"}`}
        >
          Tất cả ({totalTables})
        </button>
        <button 
          onClick={() => setFilter("OPEN")}
          className={`whitespace-nowrap px-5 py-2.5 rounded-full transition-colors ${filter === "OPEN" ? "bg-primary-container text-on-primary-container font-bold shadow-sm" : "bg-surface-container-lowest text-on-surface-variant font-semibold hover:bg-surface-bright"}`}
        >
          Trống ({emptyTables})
        </button>
        <button 
          onClick={() => setFilter("ORDERING")}
          className={`whitespace-nowrap px-5 py-2.5 rounded-full transition-colors ${filter === "ORDERING" ? "bg-primary-container text-on-primary-container font-bold shadow-sm" : "bg-surface-container-lowest text-on-surface-variant font-semibold hover:bg-surface-bright"}`}
        >
          Đang phục vụ ({servingTables})
        </button>
        <button 
          onClick={() => setFilter("PAYING")}
          className={`whitespace-nowrap px-5 py-2.5 rounded-full transition-colors ${filter === "PAYING" ? "bg-primary-container text-on-primary-container font-bold shadow-sm" : "bg-surface-container-lowest text-on-surface-variant font-semibold hover:bg-surface-bright"}`}
        >
          Chờ dọn ({cleaningTables})
        </button>
      </div>

      {/* Table Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mt-2">
        {tables
          .filter(t => {
            if (filter === "ALL") return true;
            const status = tableStatus[t] || "OPEN";
            return status === filter;
          })
          .map((t) => {
            const status = tableStatus[t] || "OPEN";
            const orders = tableOrders[t] || {};
            const qty = calcTotalQty(orders);
            const revenue = Object.keys(orders).length > 0 ? 
              Object.values(orders).reduce((sum, item) => sum + item.price * item.qty, 0) 
              : 0;
            
            const isOccupied = status === "ORDERING";
            const isPaying = status === "PAYING";

            if (isOccupied) {
              return (
                <div
                  key={t}
                  onClick={() => {
                    setCurrentTable(t);
                    setSidebarView("order");
                  }}
                  className="bg-surface-container-lowest rounded-3xl p-4 md:p-5 flex flex-col justify-between min-h-[160px] relative overflow-hidden group active:scale-95 transition-all duration-200 cursor-pointer shadow-sm"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-8 -mt-8"></div>
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-headline font-extrabold text-3xl md:text-4xl text-primary">{t}</span>
                      <span className="bg-primary/10 text-primary text-[10px] md:text-[11px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">PHỤC VỤ</span>
                    </div>
                    <div className="flex items-center gap-1 text-on-surface-variant">
                      <span className="material-symbols-outlined text-sm">restaurant_menu</span>
                      <span className="text-xs font-semibold">{qty} món</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest leading-none mb-1">Tổng cộng</p>
                    <p className="font-headline font-black text-xl md:text-2xl text-on-surface leading-none">{formatMoney(revenue)}</p>
                  </div>
                </div>
              );
            }

            if (isPaying) {
              return (
                <div
                  key={t}
                  onClick={() => {
                    setCurrentTable(t);
                    setSidebarView("order");
                  }}
                  className="bg-error-container/30 rounded-3xl p-4 md:p-5 flex flex-col justify-between min-h-[160px] cursor-pointer shadow-sm"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-headline font-extrabold text-3xl md:text-4xl text-error/60">{t}</span>
                      <span className="bg-error/10 text-error text-[10px] md:text-[11px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">CHỜ DỌN</span>
                    </div>
                    <div className="flex items-center gap-1 text-error/70">
                      <span className="material-symbols-outlined text-sm">cleaning_services</span>
                      <span className="text-xs font-semibold">Cần dọn bàn</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <button className="w-full bg-white text-error font-bold text-xs py-2 md:py-3 rounded-xl shadow-sm border border-error/10 active:scale-95 transition-transform">XÁC NHẬN DỌN</button>
                  </div>
                </div>
              );
            }

            // Empty state (OPEN)
            return (
              <div
                key={t}
                onClick={() => {
                  setCurrentTable(t);
                  setSidebarView("order");
                }}
                className="bg-surface-container-low rounded-3xl p-4 md:p-5 flex flex-col justify-between min-h-[160px] border border-transparent hover:border-outline-variant/30 transition-all cursor-pointer"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-headline font-extrabold text-3xl md:text-4xl text-outline/40">{t}</span>
                    <span className="bg-surface-container-highest text-on-surface-variant/50 text-[10px] md:text-[11px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">TRỐNG</span>
                  </div>
                  <p className="text-xs font-medium text-on-surface-variant/40 italic">Chưa có khách</p>
                </div>
                <div className="mt-4 flex items-center justify-center border-2 border-dashed border-outline-variant/20 rounded-2xl py-3 group-hover:bg-surface-container-highest transition-colors">
                  <span className="material-symbols-outlined text-outline/30">add</span>
                </div>
              </div>
            );
          })}
      </div>

      {/* Floating Action for Quick Add - Optional, hidden on desktop maybe */}
      <button 
        onClick={() => setSidebarView("order")}
        className="fixed right-6 bottom-24 w-14 h-14 bg-primary text-white rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-transform z-40 lg:hidden"
      >
        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>add_box</span>
      </button>
    </div>
  );
}
