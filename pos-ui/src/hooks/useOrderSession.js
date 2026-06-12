import { useCallback, useEffect, useRef, useState } from "react";
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

export default function useOrderSession({ authedFetch, authToken, authValidated }) {
  const localSnapshot = readLocalSession();
  const [tableOrders, setTableOrders] = useState(localSnapshot?.tableOrders || {});
  const [kitchenSent, setKitchenSent] = useState(localSnapshot?.kitchenSent || {});
  const [itemNotes, setItemNotes] = useState(localSnapshot?.itemNotes || {});
  const [orderSessionReady, setOrderSessionReady] = useState(false);
  const [remoteHydrated, setRemoteHydrated] = useState(false);
  const skipNextRemoteSaveRef = useRef(false);
  const saveTimerRef = useRef(null);
  const inFlightSaveRef = useRef(null);

  const hydrateFromServer = useCallback(async () => {
    const response = await authedFetch(`${API_URL}/order-session`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    skipNextRemoteSaveRef.current = true;
    setTableOrders(data.tableOrders && typeof data.tableOrders === "object" ? data.tableOrders : {});
    setItemNotes(data.itemNotes && typeof data.itemNotes === "object" ? data.itemNotes : {});
    setKitchenSent(data.kitchenSent && typeof data.kitchenSent === "object" ? data.kitchenSent : {});
    setRemoteHydrated(true);
  }, [authedFetch]);

  useEffect(() => {
    if (!authToken || !authValidated) {
      setOrderSessionReady(false);
      setRemoteHydrated(false);
      return;
    }

    let cancelled = false;
    hydrateFromServer()
      .then(() => {
        if (cancelled) return;
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setOrderSessionReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authToken, authValidated, hydrateFromServer]);

  useEffect(() => {
    if (!authToken || !authValidated) return;
    const handlePosDataUpdated = (event) => {
      if (event.detail?.event !== "ORDER_SESSION_UPDATED") return;
      hydrateFromServer().catch(() => {});
    };
    window.addEventListener("pos-data-updated", handlePosDataUpdated);
    return () => window.removeEventListener("pos-data-updated", handlePosDataUpdated);
  }, [authToken, authValidated, hydrateFromServer]);

  useEffect(() => {
    if (!orderSessionReady) return;
    writeLocalSession({ tableOrders, itemNotes, kitchenSent });
  }, [tableOrders, itemNotes, kitchenSent, orderSessionReady]);

  useEffect(() => {
    if (!authToken || !authValidated || !orderSessionReady || !remoteHydrated) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (skipNextRemoteSaveRef.current) {
      skipNextRemoteSaveRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      saveTimerRef.current = null;
      const request = authedFetch(`${API_URL}/order-session`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableOrders, itemNotes, kitchenSent }),
      }).then(async (response) => {
        if (response.ok) return;
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }).catch((error) => {
        console.error("Khong dong bo duoc order session:", error);
        hydrateFromServer().catch(() => {});
      });
      inFlightSaveRef.current = request;
      request.finally(() => {
        if (inFlightSaveRef.current === request) inFlightSaveRef.current = null;
      });
    }, 700);
    saveTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (saveTimerRef.current === timer) saveTimerRef.current = null;
    };
  }, [tableOrders, itemNotes, kitchenSent, orderSessionReady, remoteHydrated, authedFetch, authToken, authValidated, hydrateFromServer]);

  const prepareForTableReset = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const inFlightSave = inFlightSaveRef.current;
    if (inFlightSave) await inFlightSave.catch(() => {});
  }, []);

  const applyServerTableReset = useCallback((tableNum) => {
    const tableKey = String(tableNum);
    skipNextRemoteSaveRef.current = true;
    setTableOrders((prev) => {
      const next = { ...prev };
      delete next[tableKey];
      return next;
    });
    setItemNotes((prev) => {
      const next = { ...prev };
      delete next[tableKey];
      return next;
    });
    setKitchenSent((prev) => {
      const next = { ...prev };
      delete next[tableKey];
      return next;
    });
  }, []);

  return {
    tableOrders,
    setTableOrders,
    kitchenSent,
    setKitchenSent,
    itemNotes,
    setItemNotes,
    orderSessionReady,
    applyServerTableReset,
    prepareForTableReset,
  };
}
