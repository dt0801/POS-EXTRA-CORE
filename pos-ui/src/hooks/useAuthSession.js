import { useCallback, useEffect, useRef, useState } from "react";
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
  // Chỉ alert 1 lần sau mỗi lần đăng nhập lại (hoặc reload trang).
  const didAlertForceLogoutRef = useRef(false);

  const forceLogout = useCallback((reason) => {
    clearAuthSession();
    setAuthToken("");
    setAuthUser(null);
    // Chặn spam alert khi nhiều request/WS đồng thời bị 401/FORCE_LOGOUT.
    if (reason && !didAlertForceLogoutRef.current) {
      didAlertForceLogoutRef.current = true;
      alert(reason);
    }
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
    // Use cached session immediately to avoid blocking UI on every reload.
    setAuthToken(token);
    setAuthUser(cachedUser);
    setAuthReady(true);
    fetchMe(token)
      .then((user) => setAuthUser(user))
      .catch(() => {
        clearAuthSession();
        setAuthToken("");
        setAuthUser(null);
      });
  }, []);

  useEffect(() => {
    if (!authToken || !authUser) return;
    // Khi đăng nhập/refresh thành công thì cho phép alert lại ở lần force logout tiếp theo.
    didAlertForceLogoutRef.current = false;

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
