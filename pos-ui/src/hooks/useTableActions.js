import { useCallback } from "react";

export default function useTableActions({
  orderSessionReady,
  currentTable,
  tableStatus,
  currentItems,
  splitTarget,
  splitSelected,
  defaultKitchenCategoryId = "MAIN",
  setTableOrders,
  setKitchenSent,
  setItemNotes,
  updateTableStatus,
  setTableStatus,
  setCurrentTable,
  setSplitModal,
  setSplitSelected,
  setSplitTarget,
}) {
  const addItem = useCallback((item) => {
    if (!orderSessionReady) return alert("Dang tai du lieu don, thu lai sau vai giay.");
    if (!currentTable) return alert("Vui long chon ban truoc!");

    setTableOrders((prev) => {
      const table = prev[currentTable] || {};
      const exist = table[item.id];
      return {
        ...prev,
        [currentTable]: {
          ...table,
          [item.id]: exist ? { ...exist, qty: exist.qty + 1 } : { ...item, qty: 1 },
        },
      };
    });

    if (!tableStatus[currentTable] || tableStatus[currentTable] === "PAID") {
      updateTableStatus(currentTable, "OPEN");
    }
  }, [currentTable, orderSessionReady, setTableOrders, tableStatus, updateTableStatus]);

  /** Một dòng món không có trong menu — chỉ tồn tại trên đơn / bill, không POST menu. */
  const addCustomLineItem = useCallback(
    ({ name, priceCents, type = "FOOD", kitchen_category, qty = 1 }) => {
      if (!orderSessionReady) return alert("Dang tai du lieu don, thu lai sau vai giay.");
      if (!currentTable) return alert("Vui long chon ban truoc!");
      const trimmed = String(name || "").trim();
      if (!trimmed) return alert("Vui long nhap ten mon.");
      const cents = Math.round(Number(priceCents) || 0);
      if (!Number.isFinite(cents) || cents < 0) return alert("Gia khong hop le.");
      const q = Math.max(1, Math.min(99, Math.round(Number(qty) || 1)));
      const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const isDrink = type === "DRINK";
      const cat = isDrink ? "" : kitchen_category || defaultKitchenCategoryId || "MAIN";
      const item = {
        id,
        name: trimmed,
        price: cents,
        type: isDrink ? "DRINK" : "FOOD",
        kitchen_category: cat,
        image: "",
        is_custom_line: true,
      };
      setTableOrders((prev) => {
        const table = prev[currentTable] || {};
        return {
          ...prev,
          [currentTable]: {
            ...table,
            [id]: { ...item, qty: q },
          },
        };
      });
      if (!tableStatus[currentTable] || tableStatus[currentTable] === "PAID") {
        updateTableStatus(currentTable, "OPEN");
      }
    },
    [
      currentTable,
      defaultKitchenCategoryId,
      orderSessionReady,
      setTableOrders,
      tableStatus,
      updateTableStatus,
    ]
  );

  const updateQty = useCallback((itemId, action) => {
    if (!orderSessionReady) return;
    if (!currentTable) return;
    setTableOrders((prev) => {
      const table = prev[currentTable];
      if (!table || !table[itemId]) return prev;
      const newQty = action === "inc" ? table[itemId].qty + 1 : table[itemId].qty - 1;
      const updated = { ...table };
      if (newQty <= 0) delete updated[itemId];
      else updated[itemId] = { ...table[itemId], qty: newQty };
      return { ...prev, [currentTable]: updated };
    });
  }, [currentTable, orderSessionReady, setTableOrders]);

  const removeItem = useCallback((itemId) => {
    if (!orderSessionReady) return;
    if (!currentTable) return;
    setTableOrders((prev) => {
      const table = prev[currentTable];
      if (!table) return prev;
      const { [itemId]: removed, ...updated } = table;
      void removed;
      return { ...prev, [currentTable]: updated };
    });
  }, [currentTable, orderSessionReady, setTableOrders]);

  const resetTable = useCallback(() => {
    if (!orderSessionReady) return;
    if (!currentTable) return;
    if (!window.confirm(`Reset ban ${currentTable}? Toan bo order se bi xoa.`)) return;

    setTableOrders((prev) => { const c = { ...prev }; delete c[currentTable]; return c; });
    setKitchenSent((prev) => { const c = { ...prev }; delete c[currentTable]; return c; });
    setItemNotes((prev) => { const c = { ...prev }; delete c[currentTable]; return c; });
    updateTableStatus(currentTable, "PAID");
  }, [currentTable, orderSessionReady, setItemNotes, setKitchenSent, setTableOrders, updateTableStatus]);

  const transferTable = useCallback(async (targetTable) => {
    if (!orderSessionReady) return;
    if (!currentTable || currentTable === targetTable) return;

    const targetStatus = tableStatus[targetTable];
    if (targetStatus === "OPEN" || targetStatus === "PAYING") {
      alert(`Ban ${targetTable} dang co khach, khong the chuyen!`);
      return;
    }

    setTableOrders((prev) => {
      const updated = { ...prev };
      updated[targetTable] = prev[currentTable] || {};
      delete updated[currentTable];
      return updated;
    });

    setKitchenSent((prev) => {
      const updated = { ...prev };
      updated[targetTable] = prev[currentTable] || {};
      delete updated[currentTable];
      return updated;
    });

    setItemNotes((prev) => {
      const updated = { ...prev };
      updated[targetTable] = prev[currentTable] || {};
      delete updated[currentTable];
      return updated;
    });

    await updateTableStatus(currentTable, "PAID");
    await updateTableStatus(targetTable, "OPEN");
    setTableStatus((prev) => ({ ...prev, [currentTable]: "PAID", [targetTable]: "OPEN" }));
    setCurrentTable(targetTable);
  }, [currentTable, orderSessionReady, setCurrentTable, setItemNotes, setKitchenSent, setTableOrders, setTableStatus, tableStatus, updateTableStatus]);

  const executeSplit = useCallback(() => {
    if (!orderSessionReady) return;
    if (!splitTarget || splitSelected.length === 0) return;
    const itemsToMove = currentItems.filter((i) => splitSelected.includes(i.id));
    const remaining = currentItems.filter((i) => !splitSelected.includes(i.id));

    setTableOrders((prev) => {
      const dest = { ...(prev[splitTarget] || {}) };
      itemsToMove.forEach((item) => {
        const ex = dest[item.id];
        if (ex) dest[item.id] = { ...ex, qty: ex.qty + item.qty };
        else dest[item.id] = { ...item };
      });
      const remainObj = {};
      remaining.forEach((item) => { remainObj[item.id] = { ...item }; });
      return { ...prev, [splitTarget]: dest, [currentTable]: remainObj };
    });

    setItemNotes((prev) => {
      const srcN = prev[currentTable] || {};
      const dstN = { ...(prev[splitTarget] || {}) };
      itemsToMove.forEach((item) => {
        const n = srcN[item.id];
        if (n) dstN[item.id] = n;
      });
      const remainN = {};
      remaining.forEach((item) => {
        const n = srcN[item.id];
        if (n) remainN[item.id] = n;
      });
      return { ...prev, [splitTarget]: dstN, [currentTable]: remainN };
    });

    setKitchenSent((prev) => {
      const srcK = prev[currentTable] || {};
      const dstK = { ...(prev[splitTarget] || {}) };
      itemsToMove.forEach((item) => {
        const q = srcK[item.id];
        if (q != null) dstK[item.id] = q;
      });
      const remainK = {};
      remaining.forEach((item) => {
        const q = srcK[item.id];
        if (q != null) remainK[item.id] = q;
      });
      return { ...prev, [splitTarget]: dstK, [currentTable]: remainK };
    });

    setTableStatus((p) => ({
      ...p, [splitTarget]: "OPEN",
      ...(remaining.length === 0 ? { [currentTable]: "PAID" } : {}),
    }));
    updateTableStatus(splitTarget, "OPEN");
    if (remaining.length === 0) updateTableStatus(currentTable, "PAID");
    setSplitModal(false);
    setSplitSelected([]);
    setSplitTarget("");
  }, [currentItems, currentTable, orderSessionReady, setItemNotes, setKitchenSent, setSplitModal, setSplitSelected, setSplitTarget, setTableOrders, setTableStatus, splitSelected, splitTarget, updateTableStatus]);

  return {
    addItem,
    addCustomLineItem,
    updateQty,
    removeItem,
    resetTable,
    transferTable,
    executeSplit,
  };
}
