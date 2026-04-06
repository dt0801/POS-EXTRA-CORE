import { useCallback } from "react";
import { API_URL } from "../config/api";
import { isPosElectron, printViaElectronRemote } from "../services/electronPrint";
import { generateBillHTML } from "./billHTML";
import { openBillPrintWindow } from "../utils/openBillPrintWindow";

export default function usePrintFlow({
  authedFetch,
  isAdmin,
  orderSessionReady,
  currentTable,
  currentItems,
  itemNotes,
  total,
  setKitchenSent,
  updateTableStatus,
  settings,
}) {
  const callPrintApi = useCallback(
    async (endpoint, payload) => {
      if (isPosElectron() && endpoint.startsWith("/print/")) {
        return printViaElectronRemote(API_URL, endpoint, payload);
      }
      const res = await authedFetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok) throw new Error(data.error || "Print failed");
      return data;
    },
    [authedFetch]
  );

  const printOrderTicket = useCallback(
    async (targetType) => {
      if (!orderSessionReady) return alert("Dang tai du lieu don, thu lai sau vai giay.");
      if (!currentTable) return alert("Vui long chon ban!");

      const itemsToPrint = currentItems.filter((item) => {
        const isDrink = item.type === "DRINK";
        if (targetType === "DRINK") return isDrink;
        if (targetType === "FOOD") return !isDrink;
        return true;
      });

      if (itemsToPrint.length === 0) {
        return alert(targetType === "DRINK" ? "Chua co mon nuoc nao!" : "Chua co mon do an nao!");
      }

      const notes = itemNotes[currentTable] || {};
      const payloadItems = itemsToPrint.map((item) => ({
        ...item,
        note: notes[item.id] || "",
      }));

      try {
        await callPrintApi("/print/kitchen", {
          table_num: currentTable,
          items: payloadItems,
        });
      } catch {
        const kitchenItems = payloadItems.map((i) => ({
          name: i.name,
          qty: i.qty,
          note: i.note || "",
          type: i.type || "FOOD",
          kitchen_category: i.kitchen_category,
        }));
        openBillPrintWindow(
          generateBillHTML({
            settings,
            type: "kitchen",
            tableNum: currentTable,
            items: kitchenItems,
            total: 0,
            injectExtraCss: settings.bill_css_override || "",
          })
        );
      }

      setKitchenSent((prev) => {
        const currentSent = prev[currentTable] || {};
        const newSent = { ...currentSent };
        itemsToPrint.forEach((i) => {
          newSent[i.id] = i.qty;
        });
        return { ...prev, [currentTable]: newSent };
      });
    },
    [callPrintApi, currentItems, currentTable, itemNotes, orderSessionReady, setKitchenSent, settings]
  );

  const handlePayment = useCallback(async () => {
    if (!isAdmin) return alert("Ban khong co quyen thanh toan.");
    if (!orderSessionReady) return;
    if (!currentTable) return;
    if (currentItems.length === 0) return alert("Ban chua co mon!");

    const notes = itemNotes[currentTable] || {};
    const itemsForBill = currentItems.map((i) => ({
      name: i.name,
      price: i.price,
      qty: i.qty,
      type: i.type || "FOOD",
      note: notes[i.id] || "",
    }));

    const billRes = await authedFetch(`${API_URL}/bills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table_num: currentTable,
        total,
        items: itemsForBill.map(({ name, price, qty, type }) => ({ name, price, qty, type })),
      }),
    });

    if (!billRes || !billRes.ok) {
      let err = {};
      try {
        err = await billRes.json();
      } catch {}
      alert(`Loi thanh toan: ${err.error || "Khong luu duoc hoa don"}`);
      return;
    }

    let saved = {};
    try {
      saved = await billRes.json();
    } catch {}
    const billId = saved.id;

    const itemsPrint = itemsForBill.map((i) => ({ name: i.name, price: i.price, qty: i.qty }));

    try {
      await callPrintApi("/print/bill", {
        table_num: currentTable,
        items: itemsPrint,
        total,
      });
    } catch {
      openBillPrintWindow(
        generateBillHTML({
          settings,
          type: "bill",
          tableNum: currentTable,
          items: itemsPrint,
          total,
          billId,
          injectExtraCss: settings.bill_css_override || "",
        })
      );
    }

    updateTableStatus(currentTable, "PAYING");
  }, [
    authedFetch,
    callPrintApi,
    currentItems,
    currentTable,
    isAdmin,
    itemNotes,
    orderSessionReady,
    settings,
    total,
    updateTableStatus,
  ]);

  const printTamTinh = useCallback(async () => {
    if (!orderSessionReady) return alert("Dang tai du lieu don, thu lai sau vai giay.");
    if (!currentTable) return alert("Vui long chon ban!");
    if (currentItems.length === 0) return alert("Chua co mon nao!");

    const provisionalTotal = currentItems.reduce((s, i) => s + i.price * i.qty, 0);
    const notes = itemNotes[currentTable] || {};
    const itemsForBill = currentItems.map((i) => ({
      name: i.name,
      price: i.price,
      qty: i.qty,
      type: i.type || "FOOD",
      note: notes[i.id] || "",
    }));
    const itemsPrint = itemsForBill.map((i) => ({ name: i.name, price: i.price, qty: i.qty }));

    try {
      await callPrintApi("/print/tamtinh", {
        table_num: currentTable,
        items: itemsPrint,
        total: provisionalTotal,
      });
    } catch {
      openBillPrintWindow(
        generateBillHTML({
          settings,
          type: "tamtinh",
          tableNum: currentTable,
          items: itemsPrint,
          total: provisionalTotal,
          injectExtraCss: settings.bill_css_override || "",
        })
      );
    }
  }, [callPrintApi, currentItems, currentTable, itemNotes, orderSessionReady, settings]);

  return {
    callPrintApi,
    printOrderTicket,
    handlePayment,
    printTamTinh,
  };
}
