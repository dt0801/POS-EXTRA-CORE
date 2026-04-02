import React, { useMemo } from "react";
import { FILTERS } from "../../constants/filters";

const removeTones = (str) => {
  const map = {
    'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
    'ă': 'a', 'ắ': 'a', 'ằ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
    'â': 'a', 'ấ': 'a', 'ầ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
    'đ': 'd', 'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
    'ê': 'e', 'ế': 'e', 'ề': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
    'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
    'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
    'ô': 'o', 'ố': 'o', 'ồ': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
    'ơ': 'o', 'ớ': 'o', 'ờ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
    'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
    'ư': 'u', 'ứ': 'u', 'ừ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
    'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
  };
  return str.toLowerCase().split('').map(c => map[c] || c).join('');
};

const filterMenu = (menu, filter) => {
  if (filter === "ALL") return menu;
  const r = (m) => removeTones(m.name);
  const has = (m, ...keys) => keys.some(k => r(m).includes(removeTones(k)));
  const hasN = (m, ...keys) => !keys.some(k => r(m).includes(removeTones(k)));

  const map = {
    COMBO: (m) => m.type === "COMBO",
    DRINK: (m) => m.type === "DRINK",
    KHAI_VI: (m) => has(m, "xuc xich", "khoai tay", "salad"),
    SIGNATURE: (m) => has(m, "oc nhoi", "heo moi", "nai xao", "nai xong", "dat vang", "tieu xanh"),
    NHAU: (m) => has(m, "sun ga chien", "chan ga chien", "canh ga chien", "ech chien gion", "ca trung chien"),
    GA: (m) => has(m, "ga") && hasN(m, "chien man", "sun ga", "ca trum", "ra lau"),
    BO: (m) => has(m, "bo") && hasN(m, "bun bo", "ra bo"),
    HEO: (m) => has(m, "heo", "nai", "suon heo"),
    ECH: (m) => has(m, "ech"),
    CA: (m) => has(m, "ca trung nuong", "ca tam nuong"),
    LUON: (m) => has(m, "luon ngong"),
    SO_DIEP: (m) => has(m, "so diep"),
    HAISAN: (m) => has(m, "tom", "muc", "bach tuoc"),
    RAU: (m) => has(m, "rau muong", "rau cu xao", "rau rung", "mang tay xao"),
    LAU: (m) => has(m, "lau", "dia lau", "nam kim cham", "mi goi", "rau lau") && hasN(m, "ca tau mang"),
    COM_MI: (m) => has(m, "com chien", "mi xao", "com lam"),
  };
  const fn = map[filter];
  return fn ? menu.filter(fn) : menu;
};

export default function MobileOrderView({
  menu,
  filter,
  setFilter,
  searchQuery,
  setSearchQuery,
  currentTable,
  tableOrders,
  total,
  calcTotalQty,
  addItem,
  updateQty,
  formatMoney,
  menuImageSrc,
  sidebarView,
  setSidebarView,
  setShowMobileCart,
  language = "vi",
}) {
  const tr = (vi, de) => (language === "de" ? de : vi);
  const filterLabel = (f) => {
    const map = {
      ALL: tr("Tất cả", "Alle"),
      COMBO: "Combo",
      DRINK: tr("Đồ uống", "Getränk"),
      KHAI_VI: tr("Khai vị", "Vorspeise"),
      SIGNATURE: tr("Signature", "Signature"),
      NHAU: tr("Nhậu", "Snacks"),
      GA: tr("Gà", "Huhn"),
      BO: tr("Bò", "Rind"),
      HEO: tr("Heo", "Schwein"),
      ECH: tr("Ếch", "Frosch"),
      CA: tr("Cá", "Fisch"),
      LUON: tr("Lươn", "Aal"),
      SO_DIEP: tr("Sò điệp", "Jakobsmuschel"),
      HAISAN: tr("Hải sản", "Meeresfrüchte"),
      RAU: tr("Rau", "Gemüse"),
      LAU: tr("Lẩu", "Hotpot"),
      COM_MI: tr("Cơm/Mì", "Reis/Nudeln"),
    };
    return map[f.key] || f.label;
  };
  const filteredMenu = useMemo(() => {
    const byTab = filterMenu(menu, filter);
    if (!searchQuery) return byTab;
    const queryStr = removeTones(searchQuery);
    return byTab.filter(m => removeTones(m.name).includes(queryStr));
  }, [menu, filter, searchQuery]);

  // Derived state for the footer summary
  const totalQty = calcTotalQty(tableOrders[currentTable]);
  // Use payment logic or show an alert if not implemented directly here
  // In App.js, click "Thanh toán" will trigger the same view as the order aside, 
  // maybe we emit an event or call a prop `onOpenCart`. 
  // For now, let's assume setting `sidebarView="tables"` as a switch or just opening a cart modal.
  const openCart = () => {
    setShowMobileCart(true);
  };

  return (
    <div className="flex flex-col h-full relative bg-surface-container font-body text-on-surface antialiased overflow-hidden">
      <main className="flex-1 overflow-y-auto pb-32">
        {/* Category Filter */}
        <section className="sticky top-14 z-30 bg-surface-container py-4 shadow-sm">
          <div className="flex overflow-x-auto hide-scrollbar px-6 gap-3">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex-none px-6 py-2.5 rounded-full font-semibold text-sm transition-all active:scale-95 whitespace-nowrap
                  ${filter === f.key
                    ? "bg-primary-container text-on-primary-container"
                    : "bg-surface-container-lowest text-on-surface-variant hover:bg-orange-100/50"
                  }`}
              >
                {filterLabel(f)}
              </button>
            ))}
          </div>
        </section>

        {/* Menu Grid */}
        <section className="px-6 grid grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
          {filteredMenu.map(m => {
            const qty = tableOrders[currentTable]?.[m.id]?.qty || 0;
            return (
              <div key={m.id} className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm group">
                <div className="aspect-[4/3] relative overflow-hidden bg-surface-container-high" onClick={() => addItem(m)}>
                  {m.image ? (
                    <img
                      src={menuImageSrc(m.image)}
                      alt={m.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                      <span className="material-symbols-outlined text-3xl opacity-50">restaurant</span>
                    </div>
                  )}
                  {qty > 0 && (
                    <div className="absolute top-2 left-2 bg-primary text-white font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center shadow-md">
                      {qty}
                    </div>
                  )}
                </div>
                <div className="p-4 flex flex-col justify-between h-[100px]">
                  <h3 className="font-bold text-on-surface leading-tight text-sm mb-1 line-clamp-2">{m.name}</h3>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-primary font-black text-base">{formatMoney(m.price)}</span>
                    {qty === 0 ? (
                      <button onClick={() => addItem(m)} className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center active:scale-90 transition-all">
                        <span className="material-symbols-outlined text-xl">add</span>
                      </button>
                    ) : (
                      <div className="flex items-center bg-orange-50 rounded-lg p-1 gap-1 border border-orange-100">
                        <button onClick={() => updateQty(m.id, "dec")} className="w-6 h-6 rounded flex items-center justify-center text-orange-700 bg-white shadow-sm font-bold text-xs">-</button>
                        <span className="font-bold text-orange-700 w-4 text-center text-xs">{qty}</span>
                        <button onClick={() => updateQty(m.id, "inc")} className="w-6 h-6 rounded flex items-center justify-center text-white bg-orange-500 shadow-sm font-bold text-xs">+</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </main>

      {/* Floating Cart Summary */}
      {currentTable && totalQty > 0 && (
        <div className="fixed bottom-24 left-6 right-6 z-55 lg:hidden">
          <div className="bg-surface/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-between p-4 outline outline-1 outline-primary/10">
            <div className="flex items-center gap-4">
              <div className="relative w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-700">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>shopping_cart</span>
                <div className="absolute -top-2 -right-2 bg-error text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm">
                  {totalQty}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-orange-600">{tr("Bàn", "Tisch")} {currentTable}</span>
                  <span className="w-1 h-1 rounded-full bg-zinc-300"></span>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">{totalQty} {tr("Món", "Gerichte")}</span>
                </div>
                <div className="text-xl font-headline font-extrabold text-on-surface tracking-tight">{formatMoney(total)}</div>
              </div>
            </div>
            <button onClick={openCart} className="bg-primary-container text-on-primary-container px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/20">
              {tr("Chi tiết", "Details")}
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
