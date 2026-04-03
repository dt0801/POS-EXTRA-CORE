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

function readStoredSession() {
  const token = getAuthToken();
  const user = getAuthUser();
  if (!token || !user) return { token: "", user: null };
  return { token, user };
}

export default function useAuthSession() {
  const initial = readStoredSession();
  const [authToken, setAuthToken] = useState(initial.token);
  const [authUser, setAuthUser] = useState(initial.user);
  // Có token trong storage → chỉ gọi API có auth sau khi /auth/me xác nhận (tránh 401 + forceLogout hàng loạt).
  const [authValidated, setAuthValidated] = useState(() => !(initial.token && initial.user));

  const setSessionCleared = useCallback(() => {
    setAuthToken("");
    setAuthUser(null);
    setAuthValidated(true);
  }, []);
  // Chỉ alert 1 lần sau mỗi lần đăng nhập lại (hoặc reload trang).
  const didAlertForceLogoutRef = useRef(false);

  const forceLogout = useCallback((reason) => {
    clearAuthSession();
    setSessionCleared();
    // Chặn spam alert khi nhiều request/WS đồng thời bị 401/FORCE_LOGOUT.
    if (reason && !didAlertForceLogoutRef.current) {
      didAlertForceLogoutRef.current = true;
      alert(reason);
    }
  }, [setSessionCleared]);

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

  // Xác thực token cache với server; đến khi xong thì mới coi là an toàn để gọi menu/bàn/order-session.
  useEffect(() => {
    const token = getAuthToken();
    const cachedUser = getAuthUser();
    if (!token || !cachedUser) {
      setAuthValidated(true);
      return;
    }
    fetchMe(token)
      .then((user) => {
        setAuthUser(user);
        setAuthValidated(true);
      })
      .catch(() => {
        clearAuthSession();
        setSessionCleared();
      });
  }, []);

  useEffect(() => {
    if (!authToken || !authUser || !authValidated) return;
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
  }, [authToken, authUser, authValidated, forceLogout]);

  return {
    authReady: true,
    authToken,
    setAuthToken,
    authUser,
    setAuthUser,
    authValidated,
    authedFetch,
    forceLogout,
  };
}
