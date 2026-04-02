import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../config/api";
import { clearAuthSession, fetchMe, getAuthToken, getAuthUser } from "../services/authService";

function apiToWsUrl(apiBase) {
  try {
    const u = new URL(apiBase);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/pos";
    return u.toString();
  } catch {
    return "ws://127.0.0.1:3000/pos";
  }
}

export default function useAuthSession() {
  const [authReady, setAuthReady] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [authUser, setAuthUser] = useState(null);

  const forceLogout = useCallback((reason) => {
    clearAuthSession();
    setAuthToken("");
    setAuthUser(null);
    if (reason) alert(reason);
  }, []);

  const authedFetch = useCallback((url, options = {}) => {
    const token = authToken || getAuthToken();
    const headers = {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    return fetch(url, { ...options, headers }).then((res) => {
      if (res.status === 401) {
        forceLogout("Phien dang nhap da het han hoac bi dang nhap o thiet bi khac.");
      }
      return res;
    });
  }, [authToken, forceLogout]);

  useEffect(() => {
    const token = getAuthToken();
    const cachedUser = getAuthUser();
    if (!token || !cachedUser) {
      setAuthReady(true);
      return;
    }
    setAuthToken(token);
    fetchMe(token)
      .then((user) => setAuthUser(user))
      .catch(() => {
        clearAuthSession();
        setAuthToken("");
        setAuthUser(null);
      })
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (!authToken || !authUser) return;
    const wsUrl = `${apiToWsUrl(API_URL)}?token=${encodeURIComponent(authToken)}`;
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      return undefined;
    }
    ws.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload?.event === "FORCE_LOGOUT") {
          forceLogout(payload.reason || "Phien dang nhap da bi thay the.");
        }
      } catch {}
    };
    return () => {
      try {
        ws.close();
      } catch {}
    };
  }, [authToken, authUser, forceLogout]);

  return {
    authReady,
    authToken,
    setAuthToken,
    authUser,
    setAuthUser,
    authedFetch,
    forceLogout,
  };
}
