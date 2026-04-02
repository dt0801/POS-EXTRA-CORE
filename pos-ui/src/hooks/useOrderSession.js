import { useEffect, useState } from "react";
import { API_URL } from "../config/api";

const LOCAL_FALLBACK_KEY = "pos_order_session_cache_v1";

function readLocalSession() {
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      tableOrders: parsed.tableOrders && typeof parsed.tableOrders === "object" ? parsed.tableOrders : {},
      itemNotes: parsed.itemNotes && typeof parsed.itemNotes === "object" ? parsed.itemNotes : {},
      kitchenSent: parsed.kitchenSent && typeof parsed.kitchenSent === "object" ? parsed.kitchenSent : {},
    };
  } catch {
    return null;
  }
}

function writeLocalSession(payload) {
  try {
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(payload));
  } catch {}
}

export default function useOrderSession({ authedFetch, authToken }) {
  const localSnapshot = readLocalSession();
  const [tableOrders, setTableOrders] = useState(localSnapshot?.tableOrders || {});
  const [kitchenSent, setKitchenSent] = useState(localSnapshot?.kitchenSent || {});
  const [itemNotes, setItemNotes] = useState(localSnapshot?.itemNotes || {});
  const [orderSessionReady, setOrderSessionReady] = useState(false);
  const [remoteHydrated, setRemoteHydrated] = useState(false);

  useEffect(() => {
    if (!authToken) {
      setOrderSessionReady(false);
      setRemoteHydrated(false);
      return;
    }

    let cancelled = false;
    authedFetch(`${API_URL}/order-session`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (cancelled) return;
        if (data.tableOrders && typeof data.tableOrders === "object") setTableOrders(data.tableOrders);
        if (data.itemNotes && typeof data.itemNotes === "object") setItemNotes(data.itemNotes);
        if (data.kitchenSent && typeof data.kitchenSent === "object") setKitchenSent(data.kitchenSent);
        setRemoteHydrated(true);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setOrderSessionReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authedFetch, authToken]);

  useEffect(() => {
    if (!orderSessionReady) return;
    writeLocalSession({ tableOrders, itemNotes, kitchenSent });
  }, [tableOrders, itemNotes, kitchenSent, orderSessionReady]);

  useEffect(() => {
    if (!authToken || !orderSessionReady || !remoteHydrated) return;
    const t = setTimeout(() => {
      authedFetch(`${API_URL}/order-session`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableOrders, itemNotes, kitchenSent }),
      }).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [tableOrders, itemNotes, kitchenSent, orderSessionReady, remoteHydrated, authedFetch, authToken]);

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
