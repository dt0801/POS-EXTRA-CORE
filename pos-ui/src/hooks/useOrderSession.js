import { useEffect, useState } from "react";
import { API_URL } from "../config/api";

export default function useOrderSession({ authedFetch }) {
  const [tableOrders, setTableOrders] = useState({});
  const [kitchenSent, setKitchenSent] = useState({});
  const [itemNotes, setItemNotes] = useState({});
  const [orderSessionReady, setOrderSessionReady] = useState(false);

  useEffect(() => {
    authedFetch(`${API_URL}/order-session`)
      .then((r) => r.json())
      .then((data) => {
        if (data.tableOrders && typeof data.tableOrders === "object") setTableOrders(data.tableOrders);
        if (data.itemNotes && typeof data.itemNotes === "object") setItemNotes(data.itemNotes);
        if (data.kitchenSent && typeof data.kitchenSent === "object") setKitchenSent(data.kitchenSent);
      })
      .catch(() => {})
      .finally(() => setOrderSessionReady(true));
  }, [authedFetch]);

  useEffect(() => {
    if (!orderSessionReady) return;
    const t = setTimeout(() => {
      authedFetch(`${API_URL}/order-session`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableOrders, itemNotes, kitchenSent }),
      }).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [tableOrders, itemNotes, kitchenSent, orderSessionReady, authedFetch]);

  return {
    tableOrders,
    setTableOrders,
    kitchenSent,
    setKitchenSent,
    itemNotes,
    setItemNotes,
    orderSessionReady,
  };
}
