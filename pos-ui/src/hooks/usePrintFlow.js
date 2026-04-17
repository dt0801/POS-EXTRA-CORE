import { useCallback } from "react";
import { API_URL } from "../config/api";
import { isPosElectron, printViaElectronRemote } from "../services/electronPrint";
import { fetchPrintPreviewHtml } from "../services/printPreviewApi";
import {
  receiptPayloadBillPrint,
  receiptPayloadKitchenPrint,
  receiptPayloadTamTinhPrint,
} from "../utils/serverReceiptPayload";
import { openBillPrintWindow } from "../utils/openBillPrintWindow";

export default function usePrintFlow({
  authedFetch,
  isAdmin,
  orderSessionReady,
  currentTable,
  currentItems,
  itemNotes,
  kitchenSent,
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

      const sentMap = kitchenSent[currentTable] || {};
      const itemsToPrint = currentItems
        .filter((item) => {
          const isDrink = item.type === "DRINK";
          if (targetType === "DRINK") return isDrink;
          if (targetType === "FOOD") return !isDrink;
          return true;
        })
        .map((item) => {
          const sentQty = sentMap[item.id] || 0;
          const newQty = item.qty - sentQty;
          return newQty > 0 ? { ...item, qty: newQty } : null;
        })
        .filter(Boolean);

      if (itemsToPrint.length === 0) {
        return alert("Tat ca mon da duoc gui, khong co mon moi!");
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
        try {
          const html = await fetchPrintPreviewHtml({
            receipt: receiptPayloadKitchenPrint({
              tableNum: currentTable,
              items: kitchenItems,
            }),
            paper_size: 80,
            css_override: settings.bill_css_override || "",
          });
          openBillPrintWindow(html);
        } catch (e2) {
          alert(e2.message || "Không in được phiếu bếp");
        }
      }

      setKitchenSent((prev) => {
        const currentSent = prev[currentTable] || {};
        const newSent = { ...currentSent };
        itemsToPrint.forEach((i) => {
          newSent[i.id] = (currentSent[i.id] || 0) + i.qty;
        });
        return { ...prev, [currentTable]: newSent };
      });
    },
    [callPrintApi, currentItems, currentTable, itemNotes, kitchenSent, orderSessionReady, setKitchenSent, settings]
  );

  const handlePayment = useCallback(async (input) => {
    if (!orderSessionReady) return;
    if (!currentTable) return;
    if (currentItems.length === 0) return alert("Ban chua co mon!");

    const payment_method = typeof input === "string" ? input : input?.payment_method;
    const overrideItems = typeof input === "object" && input ? input.items : null;
    const overrideTotal = typeof input === "object" && input ? input.total : null;
    const subtotal = typeof input === "object" && input ? input.subtotal : null;
    const discount_percent = typeof input === "object" && input ? input.discount_percent : null;
    const discount_amount = typeof input === "object" && input ? input.discount_amount : null;
    const tip_amount = typeof input === "object" && input ? input.tip_amount : null;
    const cash_given = typeof input === "object" && input ? input.cash_given : null;
    const change_due = typeof input === "object" && input ? input.change_due : null;
    const shouldMarkPaying = typeof input === "object" && input ? input.shouldMarkPaying !== false : true;

    const pm = String(payment_method || "").trim().toUpperCase();
    const normalizedPaymentMethod = pm === "CARD" ? "CARD" : "CASH";

    const notes = itemNotes[currentTable] || {};
    const baseItems = Array.isArray(overrideItems) && overrideItems.length ? overrideItems : currentItems;
    const itemsForBill = baseItems.map((i) => ({
      name: i.name,
      price: i.price,
      qty: i.qty,
      type: i.type || "FOOD",
      note: notes[i.id] || "",
    }));
    const computedTotal = itemsForBill.reduce((s, i) => s + Number(i.price || 0) * Number(i.qty || 0), 0);
    const billTotal = overrideTotal != null ? Number(overrideTotal || 0) : computedTotal;
    const billSubtotal = subtotal != null ? Number(subtotal || 0) : computedTotal;
    const billDiscountPct = discount_percent != null ? Number(discount_percent || 0) : 0;
    const billDiscountAmount = discount_amount != null ? Number(discount_amount || 0) : 0;
    const billTipAmount = tip_amount != null ? Number(tip_amount || 0) : 0;
    const billCashGiven = cash_given != null ? Number(cash_given || 0) : 0;
    const billChangeDue = change_due != null ? Number(change_due || 0) : 0;

    const billRes = await authedFetch(`${API_URL}/bills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table_num: currentTable,
        total: billTotal,
        subtotal: billSubtotal,
        discount_percent: billDiscountPct,
        discount_amount: billDiscountAmount,
        tip_amount: billTipAmount,
        cash_given: billCashGiven,
        change_due: billChangeDue,
        payment_method: normalizedPaymentMethod,
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
    const billId = saved?.id ?? saved?.bill_id;

    const itemsPrint = itemsForBill.map((i) => ({ name: i.name, price: i.price, qty: i.qty }));

    try {
      await callPrintApi("/print/bill", {
        table_num: currentTable,
        items: itemsPrint,
        total: billTotal,
        subtotal: billSubtotal,
        discount_percent: billDiscountPct,
        discount_amount: billDiscountAmount,
        tip_amount: billTipAmount,
        cash_given: billCashGiven,
        change_due: billChangeDue,
      });
    } catch {
      try {
        const html = await fetchPrintPreviewHtml({
          receipt: receiptPayloadBillPrint({
            tableNum: currentTable,
            items: itemsPrint,
            totalValue: billTotal,
            billId,
            subtotalValue: billSubtotal,
            discountPercent: billDiscountPct,
            discountAmount: billDiscountAmount,
            tipAmount: billTipAmount,
            cashGiven: billCashGiven,
            changeDue: billChangeDue,
          }),
          paper_size: 80,
          css_override: settings.bill_css_override || "",
        });
        openBillPrintWindow(html);
      } catch (e2) {
        alert(e2.message || "Không in được hóa đơn");
      }
    }

    if (shouldMarkPaying) updateTableStatus(currentTable, "PAYING");
    return { ok: true, billId, payment_method: normalizedPaymentMethod, total: billTotal };
  }, [
    authedFetch,
    callPrintApi,
    currentItems,
    currentTable,
    itemNotes,
    orderSessionReady,
    settings,
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
      try {
        const html = await fetchPrintPreviewHtml({
          receipt: receiptPayloadTamTinhPrint({
            tableNum: currentTable,
            items: itemsPrint,
            totalValue: provisionalTotal,
          }),
          paper_size: 80,
          css_override: settings.bill_css_override || "",
        });
        openBillPrintWindow(html);
      } catch (e2) {
        alert(e2.message || "Không in được tạm tính");
      }
    }
  }, [callPrintApi, currentItems, currentTable, itemNotes, orderSessionReady, settings]);

  return {
    callPrintApi,
    printOrderTicket,
    handlePayment,
    printTamTinh,
  };
}
