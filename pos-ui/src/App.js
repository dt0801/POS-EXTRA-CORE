import { useState, useEffect, useCallback, useMemo } from "react";
import "./App.css";
import { FILTERS } from "./constants/filters";
import { API_URL, isLocalQuayOrigin } from "./config/api";
import { isPosElectron, printViaElectronRemote } from "./services/electronPrint";
import {
  clearAuthSession,
  fetchMe,
  getAuthToken,
  getAuthUser,
  login as loginRequest,
  logout as logoutRequest,
} from "./services/authService";
import { usePrinterStatus } from "./hooks/usePrinterStatus";
import SidebarItem from "./components/layout/SidebarItem";
import TablesView from "./components/views/TablesView";
import HistoryView from "./components/views/HistoryView";
import StatsView from "./components/views/StatsView";
import { fetchSettings, saveAllSettings as saveAllSettingsRequest } from "./services/settingsService";
import {
  fetchWindowsPrinters as fetchWindowsPrintersRequest,
  fetchDbPrinters as fetchDbPrintersRequest,
  addDbPrinter as addDbPrinterRequest,
} from "./services/printerService";

// =============================================
// CONSTANTS
// =============================================
const TOTAL_TABLES = 20;

// =============================================
// HELPER FUNCTIONS
// =============================================

/** Format số tiền VND */
const formatMoney = (n) => new Intl.NumberFormat("vi-VN").format(n * 1000) + "đ";

/** Ảnh menu: URL đầy đủ (Cloudinary) hoặc file trong /uploads */
const menuImageSrc = (image) => {
  if (!image) return "";
  const s = String(image).trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `${API_URL}/uploads/${s}`;
};

/** Bỏ dấu tiếng Việt để so sánh không bị lỗi encoding */
const removeTones = (str) => {
  const map = {
    'à':'a','á':'a','ả':'a','ã':'a','ạ':'a',
    'ă':'a','ắ':'a','ằ':'a','ẳ':'a','ẵ':'a','ặ':'a',
    'â':'a','ấ':'a','ầ':'a','ẩ':'a','ẫ':'a','ậ':'a',
    'đ':'d',
    'è':'e','é':'e','ẻ':'e','ẽ':'e','ẹ':'e',
    'ê':'e','ế':'e','ề':'e','ể':'e','ễ':'e','ệ':'e',
    'ì':'i','í':'i','ỉ':'i','ĩ':'i','ị':'i',
    'ò':'o','ó':'o','ỏ':'o','õ':'o','ọ':'o',
    'ô':'o','ố':'o','ồ':'o','ổ':'o','ỗ':'o','ộ':'o',
    'ơ':'o','ớ':'o','ờ':'o','ở':'o','ỡ':'o','ợ':'o',
    'ù':'u','ú':'u','ủ':'u','ũ':'u','ụ':'u',
    'ư':'u','ứ':'u','ừ':'u','ử':'u','ữ':'u','ự':'u',
    'ỳ':'y','ý':'y','ỷ':'y','ỹ':'y','ỵ':'y',
  };
  return str.toLowerCase().split('').map(c => map[c] || c).join('');
};

/** Lọc menu theo filter – dùng removeTones để tránh lỗi encoding tiếng Việt */
const filterMenu = (menu, filter) => {
  if (filter === "ALL") return menu;
  // So sánh không dấu
  const r = (m) => removeTones(m.name);
  const has  = (m, ...keys) => keys.some(k => r(m).includes(removeTones(k)));
  const hasN = (m, ...keys) => !keys.some(k => r(m).includes(removeTones(k)));

  const map = {
    COMBO:     (m) => m.type === "COMBO",
    DRINK:     (m) => m.type === "DRINK",
    KHAI_VI:   (m) => has(m, "xuc xich", "khoai tay", "salad"),
    SIGNATURE: (m) => has(m, "oc nhoi", "heo moi", "nai xao", "nai xong", "dat vang", "tieu xanh"),
    NHAU:      (m) => has(m, "sun ga chien", "chan ga chien", "canh ga chien", "ech chien gion", "ca trung chien"),
    GA:        (m) => has(m, "ga") && hasN(m, "chien man", "sun ga", "ca trum", "ra lau"),
    BO:        (m) => has(m, "bo") && hasN(m, "bun bo", "ra bo"),
    HEO:       (m) => has(m, "heo", "nai", "suon heo"),
    ECH:       (m) => has(m, "ech"),
    CA:        (m) => has(m, "ca trung nuong", "ca tam nuong"),
    LUON:      (m) => has(m, "luon ngong"),
    SO_DIEP:   (m) => has(m, "so diep"),
    HAISAN:    (m) => has(m, "tom", "muc", "bach tuoc"),
    RAU:       (m) => has(m, "rau muong", "rau cu xao", "rau rung", "mang tay xao"),
    LAU:       (m) => has(m, "lau", "dia lau", "nam kim cham", "mi goi", "rau lau") && hasN(m, "ca tau mang"),
    COM_MI:    (m) => has(m, "com chien", "mi xao", "com lam"),
  };
  const fn = map[filter];
  return fn ? menu.filter(fn) : menu;
};

/** Tính tổng tiền của 1 bàn */
const calcTotal = (tableData = {}) =>
  Object.values(tableData).reduce((s, i) => s + i.price * i.qty, 0);

/** Tính tổng số lượng món của 1 bàn */
const calcTotalQty = (tableData = {}) =>
  Object.values(tableData).reduce((s, i) => s + i.qty, 0);

function apiToWsUrl(apiUrl) {
  try {
    const u = new URL(apiUrl);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${u.host}/pos`;
  } catch {
    return "ws://127.0.0.1:3000/pos";
  }
}

// =============================================
// MAIN COMPONENT
// =============================================
export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // ----- CORE STATE -----
  const [menu, setMenu]               = useState([]);
  const [currentTable, setCurrentTable] = useState(null);
  const [tableOrders, setTableOrders] = useState({});       // { [tableNum]: { [itemId]: {...item, qty} } }
  const [tableStatus, setTableStatus] = useState({});       // { [tableNum]: "OPEN" | "PAID" }
  const [filter, setFilter]           = useState("ALL");  // key từ FILTERS
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarView, setSidebarView] = useState("order");  // "order" | "manage" | "history" | "stats"

  // ----- CHUYỂN BÀN -----
  const [showTransferModal, setShowTransferModal] = useState(false);

  // ----- SIDEBAR STATE -----
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  // Trạng thái kết nối máy in: null | "online" | "offline"
  const { printerStatus } = usePrinterStatus();

  // Danh sách máy in Windows
  const [windowsPrinters, setWindowsPrinters] = useState([]);

  // Database Printers
  const [dbPrinters, setDbPrinters] = useState([]);
  const [newPrinter, setNewPrinter] = useState({ name: "", type: "ALL", paper_size: 80, is_enabled: 1 });
  const [loadingDbPrinters, setLoadingDbPrinters] = useState(false);

  // Settings
  const [settings, setSettings]     = useState({
    printer_ip:    "",
    printer_type:  "",
    store_name:    "",
    store_address: "",
    store_phone:   "",
    cashier_name:  "",
    total_tables:  "20",
    bill_css_override: "",
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [splitModal,    setSplitModal]    = useState(false);
  const [splitTarget,   setSplitTarget]   = useState("");
  const [splitSelected, setSplitSelected] = useState([]);
  const [statsTab,      setStatsTab]      = useState("day");
  const [statsMonthlyData, setStatsMonthlyData] = useState(null);
  const [statsYearlyData,  setStatsYearlyData]  = useState(null);
  const [statsYear,     setStatsYear]     = useState(new Date().getFullYear().toString());

  const isAdmin = (authUser?.role || "staff") === "admin";

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
        forceLogout("Phiên đăng nhập đã hết hạn hoặc bị đăng nhập ở thiết bị khác.");
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
      .then((user) => {
        setAuthUser(user);
      })
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
          forceLogout(payload.reason || "Phiên đăng nhập đã bị thay thế.");
        }
      } catch {
        // ignore malformed event
      }
    };
    return () => {
      try {
        ws.close();
      } catch {}
    };
  }, [authToken, authUser, forceLogout]);

  // Load settings từ server khi đăng nhập thành công
  useEffect(() => {
    if (!authUser) return;
    fetchSettings()
      .then((d) => setSettings((prev) => ({ ...prev, ...d })))
      .catch(() => {});
  }, [authUser]);

  // Lưu toàn bộ settings
  const saveAllSettings = async () => {
    await saveAllSettingsRequest(settings);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const data = await loginRequest(loginForm.username, loginForm.password);
      setAuthToken(data.token);
      setAuthUser(data.user);
      setSidebarView("order");
      setLoginForm({ username: "", password: "" });
    } catch (err) {
      setLoginError(err.message || "Đăng nhập thất bại");
    }
    setLoggingIn(false);
  };

  const handleLogout = async () => {
    const token = authToken || getAuthToken();
    await logoutRequest(token);
    setAuthToken("");
    setAuthUser(null);
    setSidebarView("order");
  };

  // Lấy danh sách máy in từ Windows
  const fetchWindowsPrinters = useCallback(async () => {
    try {
      const data = await fetchWindowsPrintersRequest();
      setWindowsPrinters(data);
    } catch {
      setWindowsPrinters([]);
    }
  }, []);

  // API tương tác máy in trên Database
  const fetchDbPrinters = useCallback(async () => {
    setLoadingDbPrinters(true);
    try {
      const data = await fetchDbPrintersRequest();
      setDbPrinters(data);
    } catch (e) {
      console.error(e);
    }
    setLoadingDbPrinters(false);
  }, []);

  const addDbPrinter = async () => {
    if (!newPrinter.name) return alert("Vui lòng chọn tên máy in");
    try {
      await addDbPrinterRequest(newPrinter);
      setNewPrinter({ name: "", type: "ALL", paper_size: 80, is_enabled: 1 });
      fetchDbPrinters();
    } catch (e) {
      alert("Lỗi thêm máy in");
    }
  };

  const updateDbPrinter = async (p, updates) => {
    try {
      await authedFetch(`${API_URL}/windows_printers/${p.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, ...updates }),
      });
      fetchDbPrinters();
    } catch (e) {
      alert("Lỗi cập nhật máy in");
    }
  };

  const deleteDbPrinter = async (id) => {
    if (!window.confirm("Xóa cấu hình máy in này?")) return;
    try {
      await authedFetch(`${API_URL}/windows_printers/${id}`, { method: "DELETE" });
      fetchDbPrinters();
    } catch (e) {
      alert("Lỗi xóa máy in");
    }
  };

  // Fetch db printers khi vào tab settings
  useEffect(() => {
    if (sidebarView === "settings") {
      fetchDbPrinters();
      fetchWindowsPrinters();
    }
  }, [sidebarView, fetchDbPrinters, fetchWindowsPrinters]);

  /**
   * kitchenSent: lưu số lượng đã gửi bếp theo từng món
   * { [tableNum]: { [itemId]: qty } }
   * Dùng để biết món nào MỚI (chưa gửi bếp) hay đã gửi rồi
   */
  const [kitchenSent, setKitchenSent] = useState({});

  /**
   * itemNotes: ghi chú từng món theo từng bàn
   * { [tableNum]: { [itemId]: "ghi chú..." } }
   */
  const [itemNotes, setItemNotes] = useState({});

  /** Đã tải xong đơn từ server — tránh ghi đè / ghi rỗng trước khi khôi phục */
  const [orderSessionReady, setOrderSessionReady] = useState(false);

  // ----- MANAGE STATE -----
  const [manageTab, setManageTab]   = useState("add");
  const [newItem, setNewItem]       = useState({ name: "", price: "", type: "FOOD" });
  const [file, setFile]             = useState(null);
  const [editItem, setEditItem]     = useState(null);
  const [editFile, setEditFile]     = useState(null);

  // ----- TABLE MANAGE STATE -----
  const [tableList, setTableList]       = useState([]);
  const [newTableNum, setNewTableNum]   = useState("");
  const [editingTable, setEditingTable] = useState(null);
  const [tableMsg, setTableMsg]         = useState(null);

  // ----- HISTORY STATE -----
  const [bills, setBills]             = useState([]);
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedBill, setSelectedBill] = useState(null); // chi tiết bill đang xem
  const [settingsPreviewHtml, setSettingsPreviewHtml] = useState("");
  const [settingsPreviewPaper, setSettingsPreviewPaper] = useState(80);
  const [settingsPreviewLoading, setSettingsPreviewLoading] = useState(false);

  // ----- STATS STATE -----
  const [statsToday, setStatsToday]   = useState(null);
  const [statsMonth, setStatsMonth]   = useState(new Date().toISOString().slice(0, 7));

  // ----- DERIVED -----
  // Danh sách số bàn – lấy từ tableList (đã merge DB + settings)
  // fallback về 1..20 nếu tableList chưa load xong
  const tables = tableList.length > 0
    ? tableList.map(t => t.table_num)
    : Array.from({ length: TOTAL_TABLES }, (_, i) => i + 1);

  const currentItems  = Object.values(tableOrders[currentTable] || {});
  const total         = calcTotal(tableOrders[currentTable]);
  const filteredMenu = useMemo(() => {
    const byTab = filterMenu(menu, filter);
    if (!searchQuery) return byTab;
    const queryStr = removeTones(searchQuery);
    return byTab.filter(m => removeTones(m.name).includes(queryStr));
  }, [menu, filter, searchQuery]);
  
  // =============================================
  // DATA FETCHING
  // =============================================

  const fetchMenu = useCallback(async () => {
    try {
      const res = await authedFetch(`${API_URL}/menu`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const normalized = Array.isArray(data)
        ? data
        : Array.isArray(data?.menu)
        ? data.menu
        : Array.isArray(data?.data)
        ? data.data
        : [];
      setMenu(normalized);
    } catch (e) {
      console.error("Lỗi fetch menu:", e);
      setMenu([]);
    }
  }, [authedFetch]);

  /** Fetch trạng thái tất cả bàn từ server */
  const fetchTableStatus = useCallback(() => {
    authedFetch(`${API_URL}/tables`).then(r => r.json()).then(rows => {
      const map = {};
      rows.forEach(r => { map[r.table_num] = r.status; });
      setTableStatus(map);
    }).catch(e => console.error("Lỗi fetch tables:", e));
  }, [authedFetch]);

  /** Fetch lịch sử hóa đơn theo ngày */
  const fetchBills = useCallback((date) => {
    authedFetch(`${API_URL}/bills?date=${date}`).then(r => r.json()).then(setBills)
      .catch(e => console.error("Lỗi fetch bills:", e));
  }, [authedFetch]);

  /** Fetch thống kê hôm nay */
  const fetchStatsToday = useCallback(() => {
    authedFetch(`${API_URL}/stats/today`).then(r => r.json()).then(setStatsToday)
      .catch(e => console.error("Lỗi fetch stats today:", e));
  }, [authedFetch]);

  /** Fetch chi tiết 1 bill */
  const fetchBillDetail = async (id) => {
    const data = await authedFetch(`${API_URL}/bills/${id}`).then(r => r.json());
    setSelectedBill(data);
  };

  /** Fetch danh sách bàn đầy đủ cho trang quản lý
   *  Merge DB rows + tất cả bàn theo total_tables trong settings
   *  để bàn chưa từng dùng vẫn hiện ra
   */
  const fetchTableList = useCallback(() => {
    Promise.all([
      authedFetch(`${API_URL}/tables`).then(r => r.json()),
      authedFetch(`${API_URL}/settings`).then(r => r.json()),
    ]).then(([rows, cfg]) => {
      const settingTotal = Number(cfg.total_tables) || 20;
      // Lấy số bàn lớn nhất trong DB (phòng trường hợp có bàn vượt settings)
      const dbMax = rows.reduce((max, r) => Math.max(max, r.table_num), 0);
      const total = Math.max(settingTotal, dbMax);
      // Tạo map từ DB
      const dbMap = {};
      rows.forEach(r => { dbMap[r.table_num] = r.status; });
      // Tạo danh sách đầy đủ 1..total, merge status từ DB
      const full = Array.from({ length: total }, (_, i) => ({
        table_num: i + 1,
        status: dbMap[i + 1] || "PAID",
      }));
      setTableList(full);
    }).catch(() => {});
  }, [authedFetch]);

  // Load menu, trạng thái bàn VÀ danh sách bàn đầy đủ ngay khi khởi động
  useEffect(() => { fetchMenu(); fetchTableStatus(); fetchTableList(); }, [fetchMenu, fetchTableStatus, fetchTableList]);

  // Khôi phục đơn đang gọi từ DB (tắt app / mở lại không mất)
  useEffect(() => {
    authedFetch(`${API_URL}/order-session`)
      .then(r => r.json())
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

  // Khi vào tab manage → reload lại danh sách bàn cho chắc
  useEffect(() => {
    if (sidebarView === "manage") fetchTableList();
  }, [sidebarView, fetchTableList]);

  // Khi chuyển sang tab history → load bills của ngày đang chọn
  useEffect(() => {
    if (sidebarView === "history") fetchBills(historyDate);
  }, [sidebarView, historyDate, fetchBills]);

  const fetchStatsMonthly = useCallback((month) => {
    authedFetch(`${API_URL}/stats/monthly?month=${month}`).then(r=>r.json()).then(setStatsMonthlyData).catch(()=>{});
  }, [authedFetch]);
  const fetchStatsYearly = useCallback((year) => {
    authedFetch(`${API_URL}/stats/yearly?year=${year}`).then(r=>r.json()).then(setStatsYearlyData).catch(()=>{});
  }, [authedFetch]);

  useEffect(() => {
    if (sidebarView === "stats") {
      fetchStatsToday();
      fetchStatsMonthly(statsMonth);
      fetchStatsYearly(statsYear);
    }
  }, [sidebarView, statsMonth, statsYear, fetchStatsToday, fetchStatsMonthly, fetchStatsYearly]);

  // =============================================
  // ORDER HANDLERS
  // =============================================

  /** Thêm món vào bàn, tự động set bàn → OPEN */
  const addItem = (item) => {
    if (!orderSessionReady) return alert("Đang tải dữ liệu đơn, thử lại sau vài giây.");
    if (!currentTable) return alert("Vui lòng chọn bàn trước!");

    setTableOrders(prev => {
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

    // Tự động mở bàn khi có món đầu tiên
    if (!tableStatus[currentTable] || tableStatus[currentTable] === "PAID") {
      updateTableStatus(currentTable, "OPEN");
    }
  };

  /** Tăng / giảm số lượng món */
  const updateQty = useCallback((itemId, action) => {
    if (!orderSessionReady) return;
    if (!currentTable) return;
    setTableOrders(prev => {
      const table = prev[currentTable];
      if (!table || !table[itemId]) return prev;
      const newQty = action === "inc" ? table[itemId].qty + 1 : table[itemId].qty - 1;
      const updated = { ...table };
      if (newQty <= 0) delete updated[itemId];
      else updated[itemId] = { ...table[itemId], qty: newQty };
      return { ...prev, [currentTable]: updated };
    });
  }, [currentTable, orderSessionReady]);
  
  /** Xóa món khỏi bàn */
  const removeItem = useCallback((itemId) => {
    if (!orderSessionReady) return;
    if (!currentTable) return;
    setTableOrders(prev => {
      const table = prev[currentTable];
      if (!table) return prev;
      const { [itemId]: _, ...updated } = table;
      return { ...prev, [currentTable]: updated };
    });
  }, [currentTable, orderSessionReady]);

  // =============================================
  // TABLE STATUS & PRINT (ONE BACKEND LOGIC)
  // =============================================

  const callPrintApi = async (endpoint, payload) => {
    if (isPosElectron() && endpoint.startsWith("/print/")) {
      return printViaElectronRemote(API_URL, endpoint, payload);
    }
    const res = await authedFetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "In phiếu thất bại");
    }
    return data;
  };

  const buildSettingsPreviewPayload = useCallback(() => ({
    title: (settings.store_name || "TIỆM NƯỚNG ĐÀ LẠT VÀ EM").toUpperCase(),
    subtitle: `${settings.store_address || "Địa chỉ"} - Hotline ${settings.store_phone || "0000 000 000"}`,
    tableNum: "12",
    billNo: "9999",
    timeLabel: "Ngày",
    timeValue: new Date().toLocaleString("vi-VN"),
    items: [
      { name: "Combo Nọng Tây Đầu", qty: 1, price: 359, note: "Không hành" },
      { name: "Coca Cola", qty: 2, price: 25, note: "" },
      { name: "Khoai Tây Lắc Phô Mai", qty: 1, price: 79, note: "" },
    ],
    totalLabel: "THÀNH TIỀN",
    totalValue: 488,
    cashier: settings.cashier_name || "Nhân viên",
    footer: "*** IN LẠI ***  -  Cảm ơn quý khách!",
  }), [settings.store_name, settings.store_address, settings.store_phone, settings.cashier_name]);

  const refreshSettingsBillPreview = useCallback(async () => {
    if (sidebarView !== "settings") return;
    setSettingsPreviewLoading(true);
    try {
      const res = await authedFetch(`${API_URL}/print/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receipt: buildSettingsPreviewPayload(),
          paper_size: settingsPreviewPaper,
          css_override: settings.bill_css_override || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tạo được preview");
      setSettingsPreviewHtml(data.html || "");
    } catch (err) {
      console.error(err);
    }
    setSettingsPreviewLoading(false);
  }, [sidebarView, settingsPreviewPaper, settings.bill_css_override, buildSettingsPreviewPayload, authedFetch]);

  useEffect(() => {
    if (sidebarView !== "settings") return;
    const t = setTimeout(() => refreshSettingsBillPreview(), 200);
    return () => clearTimeout(t);
  }, [sidebarView, settings.bill_css_override, settingsPreviewPaper, settings.store_name, settings.store_address, settings.store_phone, refreshSettingsBillPreview]);

  useEffect(() => {
    if (!authUser) return;
    if (!isAdmin && ["manage", "history", "stats", "settings"].includes(sidebarView)) {
      setSidebarView("order");
    }
  }, [authUser, isAdmin, sidebarView]);

  /** Cập nhật trạng thái bàn lên server và local state */
  const updateTableStatus = async (tableNum, status) => {
    setTableStatus(prev => ({ ...prev, [tableNum]: status }));
    await authedFetch(`${API_URL}/tables/${tableNum}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  /**
   * Bước 2: In phiếu đồ ăn / nước
   */
  const printOrderTicket = async (targetType) => {
    if (!orderSessionReady) return alert("Đang tải dữ liệu đơn, thử lại sau vài giây.");
    if (!currentTable) return alert("Vui lòng chọn bàn!");
    
    // Tách món theo loại
    const itemsToPrint = currentItems.filter(item => {
      const isDrink = item.type === "DRINK";
      if (targetType === "DRINK") return isDrink;
      // FOOD bao gồm món ăn và combo, loại trừ DRINK
      if (targetType === "FOOD") return !isDrink;
      return true;
    });

    if (itemsToPrint.length === 0) {
      return alert(targetType === "DRINK" ? "Chưa có món nước nào!" : "Chưa có món đồ ăn nào!");
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
    } catch (err) {
      alert(err.message || "Không thể in phiếu");
      return;
    }

    // Chỉ cập nhật trạng thái "đã gửi bếp" cho các món vừa in
    setKitchenSent(prev => {
      const currentSent = prev[currentTable] || {};
      const newSent = { ...currentSent };
      itemsToPrint.forEach(i => {
        // Ghi lại số lượng đã gửi đi
        newSent[i.id] = i.qty;
      });
      return { ...prev, [currentTable]: newSent };
    });
  };

  /**
   * Bước 4: Thanh toán – lưu bill vào DB + in hóa đơn tài chính
   * KHÔNG reset bàn ở đây, nhân viên reset thủ công ở bước 6
   */
  const handlePayment = async () => {
    if (!isAdmin) return alert("Bạn không có quyền thanh toán.");
    if (!orderSessionReady) return;
    if (!currentTable) return;
    if (currentItems.length === 0) return alert("Bàn chưa có món!");

    const notes = itemNotes[currentTable] || {};
    const itemsForBill = currentItems.map((i) => ({
      name: i.name,
      price: i.price,
      qty: i.qty,
      type: i.type || "FOOD",
      note: notes[i.id] || "",
    }));

    // 1. Lưu bill lên server
    await authedFetch(`${API_URL}/bills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table_num: currentTable,
        total,
        items: itemsForBill.map(({ name, price, qty, type }) => ({ name, price, qty, type })),
      }),
    });

    // 2. In hóa đơn tài chính bằng 1 logic backend duy nhất
    try {
      await callPrintApi("/print/bill", {
        table_num: currentTable,
        items: itemsForBill,
        total,
      });
    } catch (err) {
      alert(err.message || "Không thể in hóa đơn");
    }

    // 3. Đánh dấu bàn là PAYING (chờ reset thủ công)
    updateTableStatus(currentTable, "PAYING");
  };

  /**
   * Bước 6: Reset bàn thủ công sau khi khách đã trả tiền xong
   */
  const resetTable = () => {
    if (!orderSessionReady) return;
    if (!currentTable) return;
    if (!window.confirm(`Reset bàn ${currentTable}? Toàn bộ order sẽ bị xóa.`)) return;

    // Xóa order
    setTableOrders(prev => { const c = { ...prev }; delete c[currentTable]; return c; });
    // Xóa kitchenSent
    setKitchenSent(prev => { const c = { ...prev }; delete c[currentTable]; return c; });
    // Xóa ghi chú
    setItemNotes(prev => { const c = { ...prev }; delete c[currentTable]; return c; });
    // Set bàn về PAID (trống)
    updateTableStatus(currentTable, "PAID");
  };


  /**
   * Chuyển bàn: di chuyển toàn bộ order từ bàn hiện tại sang bàn đích
   * Điều kiện: bàn đích phải trống (PAID hoặc chưa có trong tableStatus)
   */
  const transferTable = async (targetTable) => {
    if (!orderSessionReady) return;
    if (!currentTable || currentTable === targetTable) return;

    // Kiểm tra bàn đích
    const targetStatus = tableStatus[targetTable];
    if (targetStatus === "OPEN" || targetStatus === "PAYING") {
      alert(`Bàn ${targetTable} đang có khách, không thể chuyển!`);
      return;
    }

    // Di chuyển order
    setTableOrders(prev => {
      const updated = { ...prev };
      updated[targetTable] = prev[currentTable] || {};
      delete updated[currentTable];
      return updated;
    });

    // Di chuyển kitchenSent
    setKitchenSent(prev => {
      const updated = { ...prev };
      updated[targetTable] = prev[currentTable] || {};
      delete updated[currentTable];
      return updated;
    });

    // Di chuyển itemNotes
    setItemNotes(prev => {
      const updated = { ...prev };
      updated[targetTable] = prev[currentTable] || {};
      delete updated[currentTable];
      return updated;
    });

    // Cập nhật trạng thái: bàn cũ → PAID, bàn mới → OPEN
    await updateTableStatus(currentTable, "PAID");
    await updateTableStatus(targetTable, "OPEN");
    setTableStatus(prev => ({ ...prev, [currentTable]: "PAID", [targetTable]: "OPEN" }));
    setCurrentTable(targetTable);
    setShowTransferModal(false);
  };

  // Tách bàn
  const executeSplit = () => {
    if (!orderSessionReady) return;
    if (!splitTarget || splitSelected.length === 0) return;
    const itemsToMove = currentItems.filter(i => splitSelected.includes(i.id));
    const remaining   = currentItems.filter(i => !splitSelected.includes(i.id));
    setTableOrders(prev => {
      const dest = { ...(prev[splitTarget] || {}) };
      itemsToMove.forEach(item => {
        const ex = dest[item.id];
        if (ex) dest[item.id] = { ...ex, qty: ex.qty + item.qty };
        else dest[item.id] = { ...item };
      });
      const remainObj = {};
      remaining.forEach(item => { remainObj[item.id] = { ...item }; });
      return { ...prev, [splitTarget]: dest, [currentTable]: remainObj };
    });
    setItemNotes(prev => {
      const srcN = prev[currentTable] || {};
      const dstN = { ...(prev[splitTarget] || {}) };
      itemsToMove.forEach(item => {
        const n = srcN[item.id];
        if (n) dstN[item.id] = n;
      });
      const remainN = {};
      remaining.forEach(item => {
        const n = srcN[item.id];
        if (n) remainN[item.id] = n;
      });
      return { ...prev, [splitTarget]: dstN, [currentTable]: remainN };
    });
    setKitchenSent(prev => {
      const srcK = prev[currentTable] || {};
      const dstK = { ...(prev[splitTarget] || {}) };
      itemsToMove.forEach(item => {
        const q = srcK[item.id];
        if (q != null) dstK[item.id] = q;
      });
      const remainK = {};
      remaining.forEach(item => {
        const q = srcK[item.id];
        if (q != null) remainK[item.id] = q;
      });
      return { ...prev, [splitTarget]: dstK, [currentTable]: remainK };
    });
    setTableStatus(p => ({
      ...p, [splitTarget]: "OPEN",
      ...(remaining.length === 0 ? { [currentTable]: "PAID" } : {}),
    }));
    updateTableStatus(splitTarget, "OPEN");
    if (remaining.length === 0) updateTableStatus(currentTable, "PAID");
    setSplitModal(false); setSplitSelected([]); setSplitTarget("");
  };

  // Tạm tính
  const printTamTinh = async () => {
    if (!orderSessionReady) return alert("Đang tải dữ liệu đơn, thử lại sau vài giây.");
    if (!currentTable) return alert("Vui lòng chọn bàn!");
    if (currentItems.length === 0) return alert("Chưa có món nào!");
    const total = currentItems.reduce((s, i) => s + i.price * i.qty, 0);
    const notes = itemNotes[currentTable] || {};
    const itemsForBill = currentItems.map((i) => ({
      name: i.name,
      price: i.price,
      qty: i.qty,
      type: i.type || "FOOD",
      note: notes[i.id] || "",
    }));
    try {
      await callPrintApi("/print/tamtinh", {
        table_num: currentTable,
        items: itemsForBill,
        total,
      });
    } catch (err) {
      alert(err.message || "Không thể in tạm tính");
    }
  };

  // =============================================
  // MENU MANAGEMENT
  // =============================================

  const addMenu = async () => {
    const formData = new FormData();
    formData.append("name", newItem.name);
    formData.append("price", newItem.price);
    formData.append("type", newItem.type);
    if (file) formData.append("image", file);
    await authedFetch(`${API_URL}/menu`, { method: "POST", body: formData });
    setNewItem({ name: "", price: "", type: "FOOD" });
    setFile(null);
    fetchMenu();
  };

  const updateMenu = async () => {
    if (!editItem) return;
    const formData = new FormData();
    formData.append("name", editItem.name);
    formData.append("price", editItem.price);
    formData.append("type", editItem.type);
    if (editFile) formData.append("image", editFile);
    await authedFetch(`${API_URL}/menu/${editItem.id}`, { method: "PUT", body: formData });
    setEditItem(null);
    setEditFile(null);
    fetchMenu();
  };

  const deleteMenu = async (id) => {
    if (!window.confirm("Xóa món này?")) return;
    await authedFetch(`${API_URL}/menu/${id}`, { method: "DELETE" });
    fetchMenu();
  };

  // =============================================
  // TABLE MANAGEMENT HANDLERS
  // =============================================

  const showTableMsg = (type, text) => {
    setTableMsg({ type, text });
    setTimeout(() => setTableMsg(null), 3000);
  };

  const addTable = async () => {
    const num = Number(newTableNum);
    if (!num || num < 1) return showTableMsg("err", "Số bàn không hợp lệ");

    // Kiểm tra bàn đã có trong list chưa (kể cả bàn trong range 1..total chưa dùng)
    if (tableList.some(t => t.table_num === num)) {
      return showTableMsg("err", `Bàn ${num} đã tồn tại`);
    }

    // Lưu bàn mới vào DB
    await authedFetch(`${API_URL}/tables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table_num: num }),
    });

    // Cập nhật total_tables nếu bàn mới vượt quá tổng hiện tại
    const currentTotal = tableList.length;
    if (num > currentTotal) {
      await authedFetch(`${API_URL}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "total_tables", value: String(num) }),
      });
    }

    setNewTableNum("");
    showTableMsg("ok", `Đã thêm Bàn ${num}`);
    fetchTableList();
    fetchTableStatus();
  };

  const renameTable = async () => {
    if (!editingTable) return;
    const { table_num, new_num } = editingTable;
    if (!new_num || Number(new_num) < 1) return showTableMsg("err", "Số bàn không hợp lệ");
    if (Number(new_num) === table_num) { setEditingTable(null); return; }
    const res  = await authedFetch(`${API_URL}/tables/${table_num}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_num: Number(new_num) }),
    });
    const data = await res.json();
    if (!res.ok) return showTableMsg("err", data.error);
    setEditingTable(null);
    showTableMsg("ok", `Đã đổi Bàn ${table_num} → Bàn ${new_num}`);
    fetchTableList();
    fetchTableStatus();
  };

  const deleteTable = async (num) => {
    if (!window.confirm(`Xóa Bàn ${num}? Bàn sẽ bị xóa khỏi danh sách.`)) return;
    // Nếu bàn chưa có trong DB (chưa từng dùng) thì chỉ xóa khỏi settings total_tables
    const inDb = tableList.find(t => t.table_num === num);
    if (inDb) {
      const res  = await authedFetch(`${API_URL}/tables/${num}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) return showTableMsg("err", data.error);
    }
    // Giảm total_tables nếu num là bàn cuối, hoặc chỉ ẩn khỏi list local
    setTableList(prev => prev.filter(t => t.table_num !== num));
    showTableMsg("ok", `Đã xóa Bàn ${num}`);
    fetchTableStatus();
  };

  // =============================================
  // RENDER HELPERS
  // =============================================

  // =============================================
  // RENDER
  // =============================================
  if (!authReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-container text-on-surface">
        Đang kiểm tra phiên đăng nhập...
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-container p-6">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-surface p-6 rounded-2xl border border-outline-variant/30 shadow-sm space-y-4">
          <h1 className="text-xl font-bold text-on-surface">Đăng nhập POS</h1>
          <input
            className="w-full border border-outline-variant/40 rounded-xl px-4 py-2.5 bg-surface-container-lowest"
            placeholder="Tên đăng nhập"
            value={loginForm.username}
            onChange={(e) => setLoginForm((s) => ({ ...s, username: e.target.value }))}
          />
          <input
            type="password"
            className="w-full border border-outline-variant/40 rounded-xl px-4 py-2.5 bg-surface-container-lowest"
            placeholder="Mật khẩu"
            value={loginForm.password}
            onChange={(e) => setLoginForm((s) => ({ ...s, password: e.target.value }))}
          />
          {loginError ? <div className="text-sm text-error">{loginError}</div> : null}
          <button
            type="submit"
            disabled={loggingIn || !loginForm.username || !loginForm.password}
            className="w-full rounded-xl bg-primary text-white py-2.5 font-bold disabled:opacity-60"
          >
            {loggingIn ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    );
  }
  
  return (
    <div className="h-screen bg-surface-container text-on-surface flex overflow-hidden font-body">

       {/* ==================== MODAL TÁCH BÀN (Citrus Style) ==================== */}
      {splitModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-[2.5rem] p-8 md:p-10 border border-outline-variant/30 shadow-2xl max-w-2xl w-full relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Close Button */}
            <button onClick={() => setSplitModal(false)} className="absolute top-6 right-6 w-12 h-12 bg-surface-container-high hover:bg-outline-variant/30 text-on-surface flex items-center justify-center rounded-full transition-colors shadow-sm">
              <span className="material-symbols-outlined text-2xl">close</span>
            </button>

            <h3 className="text-3xl font-black font-headline mb-6 text-on-surface flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl">call_split</span>
              </div>
              Tách bàn {currentTable}
            </h3>

            <div className="space-y-8">
              {/* Item Selection */}
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-4 uppercase tracking-widest">
                  Chọn món muốn chuyển sang bàn khác
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {currentItems.map(item => (
                    <div key={item.id}
                      onClick={() => setSplitSelected(prev =>
                        prev.includes(item.id) ? prev.filter(x => x !== item.id) : [...prev, item.id]
                      )}
                      className={`flex items-center gap-4 p-4 rounded-3xl cursor-pointer transition-all border-2 
                        ${splitSelected.includes(item.id) 
                          ? "border-primary bg-orange-50 ring-4 ring-primary/5" 
                          : "border-stone-100 bg-stone-50/50 hover:bg-white hover:border-stone-200"}`}>
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-colors
                        ${splitSelected.includes(item.id) ? "bg-primary border-primary" : "bg-white border-stone-300"}`}>
                        {splitSelected.includes(item.id) && <span className="material-symbols-outlined text-white text-base font-bold">check</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                         <h4 className="font-bold text-on-surface text-sm truncate">{item.name}</h4>
                         <p className="text-xs text-on-surface-variant font-medium">x{item.qty} món</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Destination Selection */}
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-4 uppercase tracking-widest">
                  Chuyển sang bàn nào?
                </label>
                <div className="grid grid-cols-5 sm:grid-cols-8 gap-3 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                  {tables.filter(t => t !== currentTable).map(t => (
                    <button key={t} onClick={() => setSplitTarget(t)}
                      className={`h-12 rounded-2xl font-black text-sm transition-all border-2
                        ${splitTarget === t 
                          ? "bg-primary border-primary text-white shadow-lg shadow-orange-300/40 scale-105" 
                          : tableStatus[t]==="OPEN" 
                            ? "border-stone-200 text-on-surface font-extrabold relative bg-stone-100/50" 
                            : "border-stone-200 bg-white text-stone-400 hover:border-primary/30 hover:text-primary"}`}>
                      {t}
                      {tableStatus[t]==="OPEN" && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white"></span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4">
                <button onClick={executeSplit}
                  disabled={splitSelected.length === 0 || !splitTarget}
                  className={`flex-1 py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95
                    ${splitSelected.length > 0 && splitTarget 
                      ? "bg-gradient-to-br from-primary to-orange-600 text-white shadow-orange-300/40" 
                      : "bg-stone-200 text-stone-400 cursor-not-allowed shadow-none"}`}>
                  <span className="material-symbols-outlined text-2xl">call_split</span>
                  Xác nhận Tách bàn
                </button>
                <button onClick={() => setSplitModal(false)}
                  className="px-8 bg-surface-container-highest hover:bg-outline-variant/50 text-on-surface-variant hover:text-on-surface py-4 rounded-2xl font-black text-lg transition-all active:scale-95">
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== LEFT SIDEBAR (Stitch Version) ==================== */}
      <aside className={`h-screen ${isSidebarExpanded ? "w-64" : "w-[88px]"} bg-surface flex flex-col py-6 space-y-4 shadow-sm shrink-0 transition-all duration-300 z-10 border-r border-outline-variant/20 relative`}>
        {/* Toggle Button / Logo Area */}
        <div className={`flex items-center ${isSidebarExpanded ? "px-6 justify-between" : "justify-center"} mb-4`}>
          {isSidebarExpanded && (
            <div className="flex flex-col overflow-hidden">
              <h1 className="text-xl font-black text-primary font-headline whitespace-nowrap">Da Lat & Em</h1>
              <p className="font-manrope text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">Premium BBQ</p>
            </div>
          )}
          <button onClick={() => setIsSidebarExpanded(!isSidebarExpanded)} className="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-xl hover:bg-surface-variant flex-shrink-0">
            <span className="material-symbols-outlined text-[28px]">
              {isSidebarExpanded ? "menu_open" : "menu"}
            </span>
          </button>
        </div>

        <nav className={`flex-1 flex flex-col gap-2 ${isSidebarExpanded ? "px-4" : "px-0"}`}>
          <SidebarItem icon="grid_view" label="Sơ đồ bàn" view="tables" isActive={sidebarView === "tables"} isSidebarExpanded={isSidebarExpanded} onClick={() => setSidebarView("tables")} />
          <SidebarItem icon="restaurant_menu" label="Menu Order" view="order" isActive={sidebarView === "order"} isSidebarExpanded={isSidebarExpanded} onClick={() => setSidebarView("order")} />
          {isAdmin && <SidebarItem icon="format_list_bulleted" label="Quản lý Thực Đơn" view="manage" isActive={sidebarView === "manage"} isSidebarExpanded={isSidebarExpanded} onClick={() => setSidebarView("manage")} />}
          {isAdmin && <SidebarItem icon="receipt_long" label="Lịch sử Hóa đơn" view="history" isActive={sidebarView === "history"} isSidebarExpanded={isSidebarExpanded} onClick={() => setSidebarView("history")} />}
          {isAdmin && <SidebarItem icon="trending_up" label="Thống kê Báo cáo" view="stats" isActive={sidebarView === "stats"} isSidebarExpanded={isSidebarExpanded} onClick={() => setSidebarView("stats")} />}
          {isAdmin && <SidebarItem icon="settings" label="Cài đặt Hệ thống" view="settings" isActive={sidebarView === "settings"} isSidebarExpanded={isSidebarExpanded} onClick={() => setSidebarView("settings")} />}
        </nav>

        <div className={`flex flex-col gap-4 mt-auto ${isSidebarExpanded ? "px-4" : "px-0 items-center"}`}>
          {isSidebarExpanded ? (
            <div className="px-2 text-xs text-on-surface-variant">
              <div className="font-semibold text-on-surface">{authUser.full_name || authUser.username}</div>
              <div className="uppercase tracking-wider">{authUser.role}</div>
            </div>
          ) : null}
          {/* Status Icons */}
          <div className={`flex items-center ${isSidebarExpanded ? "justify-between px-2" : "flex-col gap-4"} text-on-surface-variant`}>
            <div title={printerStatus === "online" ? "Máy in: Online" : "Máy in: Offline"} className="flex flex-col items-center gap-1">
               <span className="material-symbols-outlined text-[20px]">print</span>
               <span className={`w-2 h-2 rounded-full ${printerStatus === "online" ? "bg-green-400" : printerStatus === "offline" ? "bg-error" : "bg-yellow-400 animate-pulse"}`}/>
            </div>
            {isAdmin ? (
              <button onClick={() => authedFetch(`${API_URL}/open-log`, { method: "POST" })} className="hover:text-primary transition-colors hover:bg-surface-variant rounded-full p-2" title="Mở Log Server">
                <span className="material-symbols-outlined text-[20px]">terminal</span>
              </button>
            ) : null}
            <button onClick={handleLogout} className="hover:text-primary transition-colors hover:bg-surface-variant rounded-full p-2" title="Đăng xuất">
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
          
        </div>
      </aside>

      {/* ==================== MAIN PANEL (Stitch Version) ==================== */}
      <main className="flex-1 flex flex-col overflow-hidden bg-surface-container relative">

        <div className="flex-1 flex overflow-hidden">

      {/* ==================== CONTENT ROUTER ==================== */}
      <div className="flex-1 p-6 lg:p-10 flex flex-col overflow-hidden w-full max-w-[1600px] mx-auto">

      {sidebarView === "tables" && (
        <TablesView
          tables={tables}
          tableStatus={tableStatus}
          tableOrders={tableOrders}
          calcTotalQty={calcTotalQty}
          formatMoney={formatMoney}
          setCurrentTable={setCurrentTable}
          setSidebarView={setSidebarView}
        />
      )}

        {/* ===== ORDER VIEW ===== */}
        {sidebarView === "order" && (
          <div className="flex-1 flex overflow-hidden gap-6 -m-6 p-6">
            
            {/* Middle: Menu Grid Area */}
            <div className="flex-1 flex flex-col gap-6 overflow-hidden">
               {/* Custom Category Tabs + Search */}
               <div className="flex items-center gap-3 overflow-x-auto pb-2 custom-scrollbar shrink-0">
                 {/* Search */}
                 <div className="relative shrink-0 mr-2">
                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 material-symbols-outlined scale-75">search</span>
                   <input
                     type="text"
                     placeholder="Tìm món ăn..."
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     className="pl-10 pr-4 py-2 bg-surface-container-high rounded-full border border-outline-variant/30 focus:border-primary outline-none focus:ring-2 focus:ring-primary/20 text-sm w-48 focus:w-64 transition-all"
                   />
                 </div>
                 {/* Tabs */}
                 {FILTERS.map(f => (
                   <button key={f.key} onClick={() => setFilter(f.key)}
                     className={`px-6 py-2.5 font-headline font-bold rounded-xl shadow-sm transition-all whitespace-nowrap
                       ${filter === f.key ? "bg-primary text-white shadow-md shadow-orange-500/30" : "bg-surface-container-lowest text-on-surface-variant hover:bg-orange-50 dark:hover:bg-stone-800"}`}
                   >{f.label}</button>
                 ))}
               </div>

               {/* Bento Grid Menu */}
               <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {menu.length === 0 ? (
                  <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-on-surface-variant border-2 border-dashed border-outline-variant/40 rounded-3xl bg-surface-container-lowest">
                    <span className="material-symbols-outlined text-5xl mb-3 opacity-40">restaurant_menu</span>
                    <p className="font-bold text-base">Chưa có dữ liệu menu</p>
                    <p className="text-sm mt-1">Vui lòng seed menu ở backend hoặc kiểm tra API `/menu`.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
                    {filteredMenu.map(m => {
                      const qty = tableOrders[currentTable]?.[m.id]?.qty || 0;
                      return (
                        <div key={m.id} className="group bg-surface-container-lowest rounded-[2rem] overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md border border-outline-variant/30">
                          <div className="h-32 relative overflow-hidden bg-surface-container-high cursor-pointer" onClick={() => addItem(m)}>
                            {m.image ? (
                              <img src={menuImageSrc(m.image)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt={m.name} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-on-surface-variant"><span className="material-symbols-outlined text-4xl opacity-50">restaurant</span></div>
                            )}
                            <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-2.5 py-0.5 rounded-full text-[10px] font-bold text-primary shadow-sm">{m.type === "FOOD" ? "Món ăn" : m.type === "DRINK" ? "Đồ uống" : "Combo"}</div>
                          </div>
                          <div className="p-3.5 flex flex-col flex-1">
                            <h3 className="font-headline font-bold text-stone-900 line-clamp-2 leading-tight mb-1 text-sm">{m.name}</h3>
                            <p className="text-[11px] font-semibold text-stone-500 mb-3">{m.type === "FOOD" ? "Món ăn" : m.type === "DRINK" ? "Đồ uống" : "Combo"}</p>
                            <div className="mt-auto flex items-center justify-between">
                              <span className="font-headline font-black text-base text-primary">{formatMoney(m.price)}</span>
                              {qty > 0 ? (
                                <div className="flex items-center bg-primary-container/20 rounded-xl p-1 gap-1.5 shadow-sm border border-primary/10">
                                  <button onClick={() => updateQty(m.id, "dec")} className="w-7 h-7 rounded-[0.5rem] bg-white text-primary flex items-center justify-center shadow-sm hover:bg-white/80 transition-colors"><span className="material-symbols-outlined text-[16px]">remove</span></button>
                                  <span className="font-extrabold text-primary w-4 text-center text-sm">{qty}</span>
                                  <button onClick={() => updateQty(m.id, "inc")} className="w-7 h-7 rounded-[0.5rem] bg-primary text-white flex items-center justify-center shadow-sm hover:bg-primary/90 transition-colors"><span className="material-symbols-outlined text-[16px]">add</span></button>
                                </div>
                              ) : (
                                <button onClick={() => addItem(m)} className="w-9 h-9 rounded-[1rem] bg-orange-50 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-sm">
                                  <span className="material-symbols-outlined text-[20px]">add</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
               </div>
            </div>

            {/* Right Side: Order Panel */}
            <aside className="w-[380px] lg:w-[420px] flex flex-col bg-white rounded-[2rem] p-6 lg:p-7 shadow-[0_8px_30px_rgba(0,0,0,0.04)] shrink-0">
               <div className="flex items-center justify-between mb-4 pb-4 border-b border-stone-100 shrink-0">
                 <div className="flex items-center gap-2">
                   <h2 className="font-headline font-black text-xl text-stone-900">Bàn {currentTable || "--"}</h2>
                   <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">
                     {currentTable ? (
                        tableStatus[currentTable] === "OPEN" ? `ORDER #${new Date().getTime().toString().slice(-4)}` :
                        tableStatus[currentTable] === "PAYING" ? "CHỜ RESET" : "TRỐNG"
                     ) : "Chưa chọn bàn"}
                   </span>
                 </div>
                 {tableStatus[currentTable] === "OPEN" && (
                   <div className="flex gap-2">
                     <button onClick={() => setShowTransferModal(true)} disabled={currentItems.length === 0} className="w-10 h-10 bg-orange-100 rounded-[1.2rem] flex items-center justify-center text-orange-600 hover:bg-orange-200 transition-all disabled:opacity-50 shadow-sm border border-orange-200/50 group/btn" title="Chuyển bàn">
                       <span className="material-symbols-outlined text-[20px]">sync_alt</span>
                     </button>
                     <button onClick={() => { setSplitSelected([]); setSplitTarget(""); setSplitModal(true); }} disabled={currentItems.length === 0} className="w-10 h-10 bg-stone-100 rounded-[1.2rem] flex items-center justify-center text-stone-500 hover:bg-stone-200 hover:text-stone-800 transition-all disabled:opacity-50 shadow-sm border border-stone-200" title="Tách bàn">
                       <span className="material-symbols-outlined text-[20px]">call_split</span>
                     </button>
                   </div>
                 )}
               </div>

               {/* Order List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar mb-4 pr-1 relative">
                  {currentItems.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center flex-col text-stone-400">
                      <span className="material-symbols-outlined text-6xl opacity-20 mb-4">restaurant</span>
                      <p className="text-sm font-semibold">Chưa có món nào</p>
                    </div>
                  ) : currentItems.map((item, idx) => {
                    const sentQty = kitchenSent[currentTable]?.[item.id] || 0;
                    const newQty  = item.qty - sentQty;
                    const note    = itemNotes[currentTable]?.[item.id] || "";
                    return (
                      <div key={item.id} className={`flex gap-3 items-center group py-2.5 ${idx < currentItems.length - 1 ? "border-b border-stone-100" : ""}`}>
                        {/* Circular Thumbnail */}
                        <div className="w-11 h-11 rounded-full overflow-hidden bg-stone-100 shrink-0 shadow-sm border border-stone-200/50">
                          {item.image ? (
                            <img src={menuImageSrc(item.image)} className="w-full h-full object-cover" alt={item.name}/>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-stone-400"><span className="material-symbols-outlined text-lg">restaurant</span></div>
                          )}
                        </div>
                        
                        {/* Name + Tag */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-stone-900 text-[13px] leading-tight line-clamp-1">{item.name}</h4>
                          {newQty > 0 && (
                            <span className="inline-flex w-fit items-center px-1.5 py-px bg-orange-50 text-[9px] font-bold text-orange-600 rounded mt-0.5">
                              + {newQty} món mới
                            </span>
                          )}
                          {note && <p className="text-[10px] text-stone-400 mt-0.5 truncate">{note}</p>}
                          <input
                            type="text"
                            value={note}
                            onChange={e => setItemNotes(prev => ({ ...prev, [currentTable]: { ...(prev[currentTable] || {}), [item.id]: e.target.value } }))}
                            placeholder="+ Ghi chú..."
                            className="w-full text-[10px] font-medium bg-transparent border-none p-0 focus:ring-0 text-stone-500 placeholder:text-stone-300 outline-none transition-all opacity-0 h-0 group-hover:opacity-100 group-hover:h-4 group-hover:mt-1"
                          />
                        </div>
                        
                        {/* Qty + Price + Actions Wrapper */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right flex flex-col items-end justify-center">
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => {
                                if (item.qty - 1 < sentQty) {
                                  setKitchenSent(prev => ({...prev, [currentTable]: { ...(prev[currentTable] || {}), [item.id]: Math.max(0, item.qty - 1) }}));
                                }
                                updateQty(item.id, "dec");
                              }} className="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors text-xs font-bold">-</button>
                              
                              <span className="font-bold text-[12px] w-5 text-center text-stone-800">{item.qty < 10 ? `0${item.qty}` : item.qty}</span>
                              
                              <button onClick={() => updateQty(item.id, "inc")} className="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors text-xs font-bold">+</button>
                            </div>
                            <span className="font-bold text-[11px] text-stone-600 mt-1 tracking-tight">{formatMoney(item.price * item.qty)}</span>
                          </div>

                          {/* Quick Actions (Squircle) */}
                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1.5 shrink-0">
                             <button className="w-7 h-7 bg-stone-50 text-stone-400 rounded-[0.7rem] flex items-center justify-center hover:bg-orange-50 hover:text-primary transition-all border border-stone-100 shadow-sm" title="Ghi chú">
                                <span className="material-symbols-outlined text-[14px]">edit</span>
                             </button>
                             <button onClick={() => removeItem(item.id)} className="w-7 h-7 bg-red-50 text-red-500 rounded-[0.7rem] flex items-center justify-center hover:bg-red-500 hover:text-white transition-all border border-red-100 shadow-sm" title="Xóa món">
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                             </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

               {/* Billing Summary */}
               <div className="pt-6 pb-6 border-t border-dashed border-stone-200 space-y-3 shrink-0">
                 <div className="flex justify-between text-[13px] font-bold text-stone-400">
                   <span>Tạm tính</span>
                   <span className="text-stone-600">{formatMoney(total)}</span>
                 </div>
                 <div className="flex justify-between items-end pt-2">
                   <span className="font-bold text-sm text-stone-900">Tổng cộng</span>
                   <span className="font-headline font-black text-2xl lg:text-3xl text-primary tracking-tight">{formatMoney(total)}</span>
                 </div>
               </div>

               {/* Action Buttons */}
               <div className="space-y-3 shrink-0">
                 <div className="grid grid-cols-2 gap-3">
                   <button
                     onClick={() => printOrderTicket('FOOD')}
                     disabled={currentItems.length === 0}
                     className="py-3.5 bg-stone-50 text-stone-600 font-bold rounded-2xl hover:bg-stone-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-xs shadow-sm border border-stone-200/50"
                   >
                     <span className="material-symbols-outlined text-[16px]">restaurant</span> {currentItems.length > 0 && currentItems.filter(i => i.type !== 'DRINK').some(i => i.qty > (kitchenSent[currentTable]?.[i.id] || 0)) ? <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error animate-pulse"></span> : null} Gửi Bếp
                   </button>
                   <button
                     onClick={() => printTamTinh()}
                     disabled={currentItems.length === 0}
                     className="py-3.5 bg-stone-50 text-stone-600 font-bold rounded-2xl hover:bg-stone-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-xs shadow-sm border border-stone-200/50"
                   >
                     <span className="material-symbols-outlined text-[16px]">receipt</span> Tạm Tính
                   </button>
                   {/* Optional: Drink order button, moved to span across if needed, or included in 3-grid. Kept exactly like image (2 cols) + fallback. */}
                   <button
                     onClick={() => printOrderTicket('DRINK')}
                     disabled={currentItems.length === 0}
                     className="col-span-2 py-2.5 bg-white text-stone-500 font-bold rounded-xl hover:bg-stone-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-[11px] border border-stone-200/30"
                   >
                     <span className="material-symbols-outlined text-[14px]">local_cafe</span> Gửi Bếp Nước
                   </button>
                 </div>
                 
                 {tableStatus[currentTable] === "PAYING" ? (
                   <button
                     onClick={resetTable}
                     className="w-full py-4 bg-error-container text-error hover:bg-red-200 font-bold text-sm rounded-[1.2rem] shadow-sm transition-all uppercase tracking-wider flex items-center justify-center gap-2"
                   >
                     <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                     RESET BÀN TRỐNG
                   </button>
                 ) : (
                   <button
                     onClick={handlePayment}
                     disabled={currentItems.length === 0}
                     className="w-full py-4 bg-primary hover:bg-[#c2410c] text-white font-bold text-sm rounded-[1.2rem] shadow-lg shadow-orange-300/40 active:scale-95 transition-all uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-70 disabled:grayscale-[0.5]"
                   >
                     <span className="material-symbols-outlined text-[18px]">payments</span>
                     THANH TOÁN & IN BILL
                   </button>
                 )}
               </div>
            </aside>
          </div>
        )}

        {/* ===== MANAGE VIEW ===== */}
        {sidebarView === "manage" && (
          <div className="flex flex-col h-full w-full max-w-7xl mx-auto">
            
            {/* Header Section with Tabs */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 shrink-0">
              <div>
                <h2 className="text-4xl font-black text-on-surface font-headline mb-2">Hệ thống Quản lý</h2>
                <p className="text-on-surface-variant font-medium">Điều chỉnh thực đơn và sơ đồ bàn nướng theo thời gian thực.</p>
              </div>
              <div className="flex bg-surface-container-high p-1.5 rounded-2xl">
                <button onClick={() => { setManageTab("edit"); setEditItem(null); }} className={`px-6 py-2.5 font-bold rounded-xl transition-all ${manageTab !== "table" ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}>
                  Món ăn & Đồ uống
                </button>
                <button onClick={() => { setManageTab("table"); setEditingTable(null); }} className={`px-6 py-2.5 font-bold rounded-xl transition-all ${manageTab === "table" ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}>
                  Quản lý Bàn
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pb-8 pr-2">
            {manageTab !== "table" && (
              <div className="flex flex-col gap-6">
                {/* Bento Grid - Menu Items Section */}
                <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {/* Add New Item Card */}
                  <div onClick={() => { setManageTab("add"); setEditItem(null); }} className="group relative flex flex-col items-center justify-center p-8 bg-white/50 border-2 border-dashed border-outline-variant rounded-[2rem] hover:border-primary-container hover:bg-orange-50 transition-all cursor-pointer min-h-[280px]">
                    <div className="w-16 h-16 rounded-full bg-primary text-white shadow-md shadow-orange-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-orange-200/50">
                      <span className="material-symbols-outlined text-3xl">add</span>
                    </div>
                    <span className="text-lg font-bold text-on-surface">Thêm món mới</span>
                    <p className="text-sm text-on-surface-variant mt-1 text-center">Cập nhật thực đơn</p>
                  </div>

                  {/* Menu Item Cards */}
                  {menu.map(m => (
                    <div key={m.id} onClick={() => { setManageTab("edit"); setEditItem({...m}); setEditFile(null); }} className={`group relative overflow-hidden rounded-[2rem] bg-surface-container-lowest border ${editItem?.id === m.id ? 'border-primary ring-2 ring-primary/20' : 'border-outline-variant/50'} shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300 cursor-pointer flex flex-col min-h-[280px]`}>
                      <div className="h-40 w-full overflow-hidden bg-surface-container-high relative">
                        {m.image ? (
                           <img src={menuImageSrc(m.image)} alt={m.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                           <div className="w-full h-full flex items-center justify-center text-on-surface-variant"><span className="material-symbols-outlined text-4xl opacity-50">restaurant</span></div>
                        )}
                        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-orange-700 shadow-sm">
                           {m.type === "FOOD" ? "Món ăn" : m.type === "DRINK" ? "Đồ uống" : "Combo"}
                        </div>
                      </div>
                      <div className="p-5 flex-1 flex flex-col">
                        <h3 className="text-lg font-bold text-on-surface mb-1 group-hover:text-primary transition-colors">{m.name}</h3>
                        <div className="mt-auto flex items-center justify-between pt-4">
                           <span className="text-xl font-black text-primary">{formatMoney(m.price)}</span>
                           <button onClick={(e) => { e.stopPropagation(); deleteMenu(m.id); }} className="w-10 h-10 rounded-full bg-error-container text-error flex items-center justify-center hover:scale-110 transition-transform shadow-sm">
                              <span className="material-symbols-outlined text-[20px]">delete</span>
                           </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </section>

                {/* Edit / Add Form MODAL */}
                {(manageTab === "add" || editItem) && (
                   <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-8 overflow-y-auto">
                     <div className="bg-surface-container-lowest rounded-[2.5rem] p-8 md:p-10 border border-outline-variant/30 shadow-2xl max-w-2xl w-full relative animate-in fade-in zoom-in-95 duration-200 mt-auto mb-auto">
                       
                       {/* Close Button */}
                       <button onClick={() => { setManageTab("edit"); setEditItem(null); setFile(null); setEditFile(null); }} className="absolute top-6 right-6 w-12 h-12 bg-surface-container-high hover:bg-outline-variant/30 text-on-surface flex items-center justify-center rounded-full transition-colors shadow-sm">
                         <span className="material-symbols-outlined text-2xl">close</span>
                       </button>

                       <h3 className="text-3xl font-black font-headline mb-8 text-on-surface pr-14 leading-tight">
                          {manageTab === "add" ? "Thêm món mới" : `Chỉnh sửa: ${editItem.name}`}
                       </h3>
                      
                       <div className="space-y-6">
                          <div>
                             <label className="block text-sm font-bold text-on-surface-variant mb-2 uppercase tracking-wider">Tên món</label>
                             <input type="text" value={manageTab === "add" ? newItem.name : editItem.name} 
                                onChange={e => manageTab === "add" ? setNewItem({...newItem, name: e.target.value}) : setEditItem({...editItem, name: e.target.value})}
                                className="w-full px-5 py-4 rounded-2xl bg-surface-container text-on-surface font-semibold border-2 border-transparent focus:border-primary focus:bg-white focus:shadow-sm outline-none transition-all placeholder:text-on-surface-variant/50 text-lg" 
                                placeholder="VD: Gà nướng muối ớt" />
                          </div>
                          <div className="grid grid-cols-2 gap-6">
                              <div>
                                 <label className="block text-sm font-bold text-on-surface-variant mb-2 uppercase tracking-wider">Giá (VND)</label>
                                 <input type="number" value={manageTab === "add" ? newItem.price : editItem.price} 
                                    onChange={e => manageTab === "add" ? setNewItem({...newItem, price: e.target.value}) : setEditItem({...editItem, price: e.target.value})}
                                    className="w-full px-5 py-4 rounded-2xl bg-surface-container text-on-surface font-semibold border-2 border-transparent focus:border-primary focus:bg-white focus:shadow-sm outline-none transition-all text-lg" />
                              </div>
                              <div>
                                 <label className="block text-sm font-bold text-on-surface-variant mb-2 uppercase tracking-wider">Loại</label>
                                 <select value={manageTab === "add" ? newItem.type : editItem.type} 
                                    onChange={e => manageTab === "add" ? setNewItem({...newItem, type: e.target.value}) : setEditItem({...editItem, type: e.target.value})}
                                    className="w-full px-5 py-4 rounded-2xl bg-surface-container text-on-surface font-semibold border-2 border-transparent focus:border-primary focus:bg-white focus:shadow-sm outline-none transition-all cursor-pointer text-lg appearance-none">
                                    <option value="FOOD">Đồ ăn</option>
                                    <option value="DRINK">Đồ uống</option>
                                    <option value="COMBO">Combo</option>
                                 </select>
                              </div>
                          </div>
                          <div>
                             <label className="block text-sm font-bold text-on-surface-variant mb-2 uppercase tracking-wider">Ảnh đại diện</label>
                             <div className="flex items-center gap-4">
                               <input type="file" accept="image/*" onChange={e => manageTab === "add" ? setFile(e.target.files[0]) : setEditFile(e.target.files[0])}
                                  className="w-full text-base text-on-surface-variant file:mr-6 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary-container file:text-primary hover:file:bg-orange-100 transition-all cursor-pointer" />
                             </div>
                             
                             {((manageTab === "add" && file) || (editItem && (editFile || editItem.image))) && (
                                <div className="mt-6 w-40 h-40 rounded-2xl overflow-hidden border-4 border-white shadow-lg relative group">
                                   <img src={manageTab === "add" ? URL.createObjectURL(file) : (editFile ? URL.createObjectURL(editFile) : editItem.image ? menuImageSrc(editItem.image) : "")} alt="preview" 
                                        className="w-full h-full object-cover" onError={e => e.target.style.display="none"} />
                                </div>
                             )}
                          </div>

                          <div className="flex gap-4 pt-4 mt-8">
                             <button onClick={manageTab === "add" ? addMenu : updateMenu} className="flex-1 bg-gradient-to-br from-primary to-orange-600 hover:scale-[1.02] text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 shadow-xl shadow-orange-300/40 active:scale-95 transition-all">
                                <span className="material-symbols-outlined text-2xl">{manageTab === "add" ? 'add_circle' : 'save_as'}</span>
                                <span>{manageTab === "add" ? "Tạo món mới" : "Lưu thay đổi"}</span>
                             </button>
                             <button onClick={() => { setManageTab("edit"); setEditItem(null); setFile(null); setEditFile(null); }} className="px-8 bg-surface-container-highest hover:bg-outline-variant/50 text-on-surface-variant hover:text-on-surface py-4 rounded-2xl font-black text-lg transition-all active:scale-95">
                                Hủy Bỏ
                             </button>
                          </div>
                       </div>
                     </div>
                   </div>
                )}
              </div>
            )}
            
            {/* ---- Tab Quản lý bàn ---- */}
            {manageTab === "table" && (
              <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
                {tableMsg && (
                   <div className={`p-4 rounded-2xl font-semibold flex items-center gap-3 ${tableMsg.type === "ok" ? "bg-green-50 text-green-700" : "bg-error-container text-error"}`}>
                      <span className="material-symbols-outlined">{tableMsg.type === "ok" ? "check_circle" : "error"}</span>
                      {tableMsg.text}
                   </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="bg-surface-container-lowest rounded-[2rem] p-8 border border-outline-variant/30 shadow-sm">
                      <h3 className="text-xl font-bold font-headline mb-6 flex items-center gap-2 text-on-surface">
                         <div className="w-10 h-10 rounded-full bg-primary-container text-primary flex items-center justify-center"><span className="material-symbols-outlined">table_restaurant</span></div>
                         Thêm bàn nhanh
                      </h3>
                      <div className="flex flex-col gap-4">
                         <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 select-none font-bold">BÀN</span>
                            <input type="number" min="1" placeholder="Số (VD: 21)" value={newTableNum} onChange={e => setNewTableNum(e.target.value)} onKeyDown={e => e.key === "Enter" && addTable()}
                               className="w-full pl-14 pr-4 py-4 rounded-xl bg-surface-container text-on-surface border border-outline-variant/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold text-lg transition-all" />
                         </div>
                         <button onClick={addTable} className="w-full py-4 bg-primary hover:bg-orange-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-orange-200/50 active:scale-95 transition-all">
                            <span className="material-symbols-outlined">add</span> Thêm bàn mới
                         </button>
                      </div>
                   </div>

                   <div className="bg-surface-container-lowest rounded-[2rem] p-8 border border-outline-variant/30 shadow-sm flex flex-col items-center justify-center text-center">
                       <span className="material-symbols-outlined text-6xl text-primary/30 mb-4">analytics</span>
                       <h4 className="text-lg font-bold">Tổng số: {tableList.length} bàn</h4>
                       <p className="text-on-surface-variant mt-2 text-sm">Quản lý không gian phục vụ và tạo thêm bàn mới khi cần.</p>
                   </div>
                </div>

                <div className="bg-surface-container-lowest rounded-[2rem] p-8 border border-outline-variant/30 shadow-sm mt-2">
                   <h3 className="text-xl font-bold font-headline mb-6 flex items-center justify-between text-on-surface">
                      <div className="flex items-center gap-2">
                         <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"><span className="material-symbols-outlined">format_list_numbered</span></div>
                         Danh sách bàn
                      </div>
                   </h3>

                   {tableList.length === 0 ? (
                      <div className="text-center py-12 text-on-surface-variant flex flex-col items-center">
                         <span className="material-symbols-outlined text-6xl mb-4 opacity-20">table_restaurant</span>
                         <p>Chưa có bàn nào trong hệ thống.</p>
                      </div>
                   ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                         {tableList.map(t => (
                            <div key={t.table_num} className="bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/50 transition-colors group relative overflow-hidden">
                               {editingTable?.table_num === t.table_num ? (
                                  <div className="flex flex-col gap-3">
                                     <div className="text-xs font-semibold text-primary uppercase">Đổi bàn số {t.table_num}</div>
                                     <input type="number" min="1" value={editingTable.new_num} onChange={e => setEditingTable({ ...editingTable, new_num: e.target.value })} onKeyDown={e => { if (e.key === "Enter") renameTable(); if (e.key === "Escape") setEditingTable(null); }} autoFocus
                                        className="w-full text-lg font-bold px-3 py-2 rounded-xl border-2 border-primary focus:outline-none bg-white text-on-surface" />
                                     <div className="flex gap-2">
                                        <button onClick={renameTable} className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-bold active:scale-95 transition-transform">Lưu</button>
                                        <button onClick={() => setEditingTable(null)} className="flex-1 py-2 bg-surface-container-highest text-on-surface-variant hover:text-on-surface rounded-lg text-sm font-bold active:scale-95 transition-transform">Huỷ</button>
                                     </div>
                                  </div>
                               ) : (
                                  <div className="flex flex-col h-full">
                                     <div className="flex justify-between items-start mb-4">
                                        <div className="font-headline font-black text-2xl text-on-surface">Bàn {t.table_num}</div>
                                        <div className="flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                           <button onClick={() => setEditingTable({ table_num: t.table_num, new_num: String(t.table_num) })} className="w-8 h-8 rounded-full bg-surface-container-highest text-on-surface hover:bg-primary hover:text-white flex items-center justify-center transition-colors">
                                              <span className="material-symbols-outlined text-[16px]">edit</span>
                                           </button>
                                           <button onClick={() => deleteTable(t.table_num)} disabled={t.status === "OPEN"} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${t.status === "OPEN" ? "bg-surface-container-highest text-outline-variant cursor-not-allowed" : "bg-surface-container-highest text-error hover:bg-error hover:text-white"}`}>
                                              <span className="material-symbols-outlined text-[16px]">delete</span>
                                           </button>
                                        </div>
                                     </div>
                                     <div className={`mt-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold w-fit ${t.status === "OPEN" ? "bg-orange-100 text-orange-700" : "bg-white/60 text-slate-500 border border-outline-variant/50"}`}>
                                        <div className={`w-2 h-2 rounded-full ${t.status === "OPEN" ? "bg-orange-500" : "bg-slate-300"}`}></div>
                                        {t.status === "OPEN" ? "Đang phục vụ" : "Trống"}
                                     </div>
                                  </div>
                               )}
                            </div>
                         ))}
                      </div>
                   )}
                </div>
              </div>
            )}
            </div>
          </div>
        )}

        {sidebarView === "history" && (
          <HistoryView
            historyDate={historyDate}
            setHistoryDate={setHistoryDate}
            setSelectedBill={setSelectedBill}
            bills={bills}
            selectedBill={selectedBill}
            fetchBillDetail={fetchBillDetail}
            formatMoney={formatMoney}
            callPrintApi={callPrintApi}
          />
        )}

        {/* ===== SETTINGS VIEW ===== */}
        {sidebarView === "settings" && (
          <div className="p-4 md:p-8 space-y-8 overflow-y-auto w-full max-w-7xl mx-auto h-full">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0">
              <div>
                <h3 className="text-3xl font-extrabold text-on-surface tracking-tight font-headline">Cấu hình Hệ thống</h3>
                <p className="text-on-surface-variant mt-1 font-medium">Quản lý thông tin cửa hàng, máy in và bảo mật tài khoản.</p>
              </div>
              <div className="flex gap-3">
                 <button onClick={saveAllSettings} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all shadow-sm ${settingsSaved ? "bg-green-500 text-white" : "bg-primary text-white shadow-primary/20 hover:opacity-90 active:scale-95"}`}>
                    <span className="material-symbols-outlined text-[20px]">{settingsSaved ? "check_circle" : "save"}</span>
                    {settingsSaved ? "Đã lưu cài đặt" : "Lưu thay đổi"}
                 </button>
              </div>
            </div>

            {/* Grid Content */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-8">
              {/* Left Column: Store Info & Security */}
              <div className="lg:col-span-4 space-y-6 flex flex-col">
                {/* 1. Thông tin quán */}
                <section className="bg-surface-container-lowest p-6 rounded-[2rem] space-y-6 border border-outline-variant/30 shadow-sm flex-1">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-secondary-container/20 text-secondary rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined">store</span>
                    </div>
                    <h4 className="font-bold text-lg font-headline text-on-surface">Thông tin quán</h4>
                  </div>
                  
                  <div className="space-y-4">
                    {[
                      { label: "Tên cửa hàng", key: "store_name", icon: "storefront", placeholder: "VD: Tiệm Nướng Đà Lạt Và Em" },
                      { label: "Địa chỉ", key: "store_address", icon: "location_on", placeholder: "Nhập địa chỉ..." },
                      { label: "Hotline", key: "store_phone", icon: "call", placeholder: "VD: 0988 123 456" }
                    ].map(({ label, key, icon, placeholder }) => (
                      <div key={key} className="space-y-1.5">
                        <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{label}</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px]">{icon}</span>
                          <input className="w-full bg-surface-container border-none rounded-xl pl-11 pr-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium text-on-surface outline-none" type="text" 
                             value={settings[key] || ""} onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))} placeholder={placeholder} />
                        </div>
                      </div>
                    ))}
                    <div className="space-y-1.5">
                       <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Số bàn tối đa</label>
                       <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px]">table_restaurant</span>
                          <input className="w-full bg-surface-container border-none rounded-xl pl-11 pr-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium text-on-surface outline-none" type="number" min="1" max="100"
                             value={settings.total_tables || "20"} onChange={e => setSettings(s => ({ ...s, total_tables: e.target.value }))} />
                       </div>
                    </div>
                  </div>
                </section>

                <section className="bg-surface-container-lowest p-6 rounded-[2rem] space-y-6 border border-outline-variant/30 shadow-sm shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined">badge</span>
                    </div>
                    <h4 className="font-bold text-lg font-headline text-on-surface">Nhân viên thu ngân</h4>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Tên hiển thị trên bill</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px]">person</span>
                      <input
                        className="w-full bg-surface-container border-none rounded-xl pl-11 pr-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium text-on-surface outline-none"
                        type="text"
                        value={settings.cashier_name || ""}
                        onChange={(e) => setSettings((s) => ({ ...s, cashier_name: e.target.value }))}
                        placeholder="VD: Thu ngân A"
                      />
                    </div>
                  </div>
                </section>
              </div>

              {/* Right Column: Printer Management */}
              <div className="lg:col-span-8 flex flex-col h-full space-y-6">
                <section className="bg-surface-container-lowest p-6 md:p-8 rounded-[2rem] border border-outline-variant/30 shadow-sm flex flex-col flex-1 h-full">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-tertiary-container/30 text-tertiary rounded-2xl flex items-center justify-center">
                        <span className="material-symbols-outlined text-[24px]">print</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-xl font-headline text-on-surface">Cấu hình Máy in mạng</h4>
                        <p className="text-sm text-on-surface-variant font-medium mt-0.5">{dbPrinters.length} thiết bị đang hoạt động</p>
                      </div>
                    </div>
                    <button onClick={fetchWindowsPrinters} className="flex items-center gap-2 bg-surface-container-high hover:bg-surface-container-highest transition-colors px-4 py-2 rounded-xl text-sm font-bold text-on-surface-variant">
                       <span className="material-symbols-outlined text-[18px]">sync</span>
                       Làm mới Windows API
                    </button>
                  </div>

                  {!isLocalQuayOrigin() && !isPosElectron() && (
                    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                      <p className="font-bold mb-1">Tại sao không thấy máy in?</p>
                      <p className="text-amber-900/90 leading-relaxed">
                        Bạn đang mở POS trên trang <strong>cloud</strong> (vd: Vercel). Để lấy máy in Windows và in từ cloud, cần{" "}
                        <strong>POS_PrintBridge.exe</strong> chạy trên máy quầy rồi kết nối tới backend.
                      </p>
                      <p className="mt-2 text-amber-900/90 leading-relaxed">
                        Hãy chạy <code className="rounded bg-amber-100/80 px-1">POS_PrintBridge.exe</code> với <code className="rounded bg-amber-100/80 px-1">server_url</code> trỏ{" "}
                        <code className="rounded bg-amber-100/80 px-1">wss://&lt;backend&gt;/bridge?secret=...</code> và{" "}
                        <code className="rounded bg-amber-100/80 px-1">api_url</code> trỏ <code className="rounded bg-amber-100/80 px-1">https://&lt;backend&gt;</code>.
                      </p>
                    </div>
                  )}

                  {/* Form thêm máy in */}
                  <div className="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/30 mb-8 shrink-0">
                     <h5 className="font-bold text-sm text-on-surface mb-4 uppercase tracking-wider">Thêm thiết bị in mới</h5>
                     <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-2 space-y-1.5">
                           <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Chọn máy in hệ thống</label>
                           <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px]">print_add</span>
                              <select value={newPrinter.name} onChange={e => setNewPrinter(s => ({ ...s, name: e.target.value }))}
                                 className="w-full bg-white border border-outline-variant/50 rounded-xl pl-10 pr-4 py-2.5 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm appearance-none">
                                 <option value="">-- Chọn máy in Windows --</option>
                                 {windowsPrinters.map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}
                              </select>
                           </div>
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Vai trò in</label>
                           <select value={newPrinter.type} onChange={e => setNewPrinter(s => ({ ...s, type: e.target.value }))}
                              className="w-full bg-white border border-outline-variant/50 rounded-xl px-4 py-2.5 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm appearance-none">
                              <option value="ALL">Tất cả</option>
                              <option value="KITCHEN">Bếp (Đồ ăn)</option>
                              <option value="DRINK">Pha chế</option>
                              <option value="BILL">Máy POS (Thanh toán)</option>
                           </select>
                        </div>
                        <button onClick={addDbPrinter} disabled={!newPrinter.name}
                           className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${newPrinter.name ? "bg-primary text-white hover:bg-orange-600 active:scale-95 shadow-md shadow-primary/20" : "bg-surface-container-highest text-outline-variant cursor-not-allowed"}`}>
                           <span className="material-symbols-outlined text-[20px]">add</span>Thêm
                        </button>
                     </div>
                  </div>

                  {/* Printer List Grid */}
                  <div className="flex-1 overflow-y-auto min-h-[300px]">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {loadingDbPrinters ? (
                         <div className="col-span-full py-12 text-center text-on-surface-variant flex flex-col items-center">
                            <span className="material-symbols-outlined animate-spin text-4xl mb-3 opacity-20">refresh</span>
                            <p className="font-medium">Đang tải cấu hình máy in...</p>
                         </div>
                      ) : dbPrinters.length === 0 ? (
                         <div className="col-span-full border-2 border-dashed border-outline-variant/50 rounded-2xl flex flex-col items-center justify-center p-12 gap-3 opacity-70">
                            <span className="material-symbols-outlined text-5xl text-outline">print_disabled</span>
                            <p className="text-sm font-bold text-on-surface-variant">Chưa có cấu hình máy in nào</p>
                         </div>
                      ) : dbPrinters.map(p => (
                         <div key={p.id} className={`p-5 rounded-2xl border transition-all group ${p.is_enabled ? 'bg-surface-container border-outline-variant/30 hover:border-primary/40 shadow-sm' : 'bg-surface-container-low border-dashed border-outline-variant/40 opacity-70'}`}>
                            <div className="flex justify-between items-start mb-4">
                               <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform ${p.is_enabled ? (p.type==='KITCHEN'?'bg-orange-100 text-orange-600':p.type==='DRINK'?'bg-blue-100 text-blue-600':'bg-primary-container text-primary') : 'bg-surface-container-highest text-outline'}`}>
                                     <span className="material-symbols-outlined text-[20px]">{p.type==='KITCHEN'?'oven_gen':p.type==='DRINK'?'local_bar':'receipt_long'}</span>
                                  </div>
                                  <div>
                                     <h5 className="font-bold text-on-surface text-sm max-w-[150px] truncate">{p.name}</h5>
                                     <span className={`text-[9px] py-0.5 px-2 rounded-full font-bold uppercase tracking-widest mt-1 inline-block ${p.is_enabled ? 'bg-green-100 text-green-700' : 'bg-surface-container-highest text-on-surface-variant'}`}>{p.is_enabled ? "Đang bật" : "Đã tắt"}</span>
                                  </div>
                               </div>
                               <div className="flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => updateDbPrinter(p, { is_enabled: p.is_enabled ? 0 : 1 })} title={p.is_enabled ? "Tắt máy in" : "Bật máy in"}
                                     className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${p.is_enabled ? 'bg-surface-container-highest text-on-surface hover:text-orange-600' : 'bg-surface-container-highest text-on-surface hover:text-green-600'}`}>
                                     <span className="material-symbols-outlined text-[18px]">{p.is_enabled ? "power_settings_new" : "play_arrow"}</span>
                                  </button>
                                  <button onClick={() => deleteDbPrinter(p.id)} title="Xóa cấu hình"
                                     className="w-8 h-8 rounded-full bg-surface-container-highest text-error hover:bg-error hover:text-white flex items-center justify-center transition-colors">
                                     <span className="material-symbols-outlined text-[18px]">delete</span>
                                  </button>
                               </div>
                            </div>
                            <div className="space-y-2 mt-4 bg-white/50 p-3 rounded-xl border border-outline-variant/20">
                               <div className="flex justify-between items-center text-xs">
                                  <span className="text-on-surface-variant font-medium">Vai trò:</span>
                                  <span className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${p.type==='KITCHEN'?'bg-orange-100 text-orange-700':p.type==='DRINK'?'bg-blue-100 text-blue-700':'bg-primary-container text-on-primary-container'}`}>{p.type === 'ALL' ? 'Tất cả' : p.type}</span>
                               </div>
                               <div className="flex justify-between items-center text-xs">
                                  <span className="text-on-surface-variant font-medium">Khổ giấy:</span>
                                  <span className="font-bold text-on-surface bg-surface-container-highest px-2 py-0.5 rounded text-[10px]">{p.paper_size}mm</span>
                               </div>
                            </div>
                         </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="bg-surface-container-lowest p-6 md:p-8 rounded-[2rem] border border-outline-variant/30 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                    <div>
                      <h4 className="font-bold text-xl font-headline text-on-surface">Live Preview Bill</h4>
                      <p className="text-sm text-on-surface-variant font-medium mt-0.5">Chỉnh CSS bill và xem ngay bản in thực tế.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        className="bg-surface-container-high border border-outline-variant/40 rounded-xl px-3 py-2 text-sm font-semibold"
                        value={settingsPreviewPaper}
                        onChange={(e) => setSettingsPreviewPaper(Number(e.target.value))}
                      >
                        <option value={58}>Khổ 58mm</option>
                        <option value={80}>Khổ 80mm</option>
                      </select>
                      <button
                        onClick={refreshSettingsBillPreview}
                        className="flex items-center gap-2 bg-surface-container-high hover:bg-surface-container-highest transition-colors px-4 py-2 rounded-xl text-sm font-bold text-on-surface"
                      >
                        <span className="material-symbols-outlined text-[18px]">refresh</span>
                        Làm mới preview
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                        Bill CSS Override (lưu trong cài đặt)
                      </label>
                      <textarea
                        className="w-full h-[360px] bg-surface-container border border-outline-variant/40 rounded-xl p-3 font-mono text-xs text-on-surface outline-none"
                        value={settings.bill_css_override || ""}
                        onChange={(e) => setSettings((s) => ({ ...s, bill_css_override: e.target.value }))}
                        placeholder={`/* Ví dụ:
.item-name { font-size: 15px !important; font-weight: 800 !important; }
.summary { font-size: 16px !important; }
*/`}
                      />
                      <p className="text-xs text-on-surface-variant">
                        Bấm <strong>Lưu thay đổi</strong> để áp dụng CSS này cho toàn bộ bill in thật.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                        Preview theo template in thật
                      </label>
                      <div className="bg-surface-container rounded-xl border border-outline-variant/40 p-3 h-[360px]">
                        {settingsPreviewLoading ? (
                          <div className="h-full flex items-center justify-center text-on-surface-variant font-medium">
                            Đang render preview...
                          </div>
                        ) : (
                          <iframe
                            title="settings-bill-preview"
                            className="w-full h-full bg-white rounded-lg"
                            srcDoc={settingsPreviewHtml}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {sidebarView === "stats" && (
          <StatsView
            formatMoney={formatMoney}
            statsTab={statsTab}
            setStatsTab={setStatsTab}
            statsMonth={statsMonth}
            setStatsMonth={setStatsMonth}
            fetchStatsMonthly={fetchStatsMonthly}
            statsYear={statsYear}
            setStatsYear={setStatsYear}
            fetchStatsYearly={fetchStatsYearly}
            statsToday={statsToday}
            statsMonthlyData={statsMonthlyData}
            statsYearlyData={statsYearlyData}
          />
        )}

      </div>

      {/* ==================== MODAL CHUYỂN BÀN (Citrus Style) ==================== */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-[2.5rem] p-8 md:p-10 border border-outline-variant/30 shadow-2xl max-w-xl w-full relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Close Button */}
            <button onClick={() => setShowTransferModal(false)} className="absolute top-6 right-6 w-12 h-12 bg-surface-container-high hover:bg-outline-variant/30 text-on-surface flex items-center justify-center rounded-full transition-colors shadow-sm">
              <span className="material-symbols-outlined text-2xl">close</span>
            </button>

            <h3 className="text-3xl font-black font-headline mb-4 text-on-surface flex items-center gap-3 pr-12">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl">sync_alt</span>
              </div>
              Chuyển bàn {currentTable}
            </h3>
            
            <p className="text-on-surface-variant font-medium mb-8">Chọn bàn đích để chuyển toàn bộ order của bàn hiện tại sang.</p>

            <div className="space-y-6">
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 gap-3 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                {tables
                  .filter(t => t !== currentTable)
                  .map(t => {
                    const status = tableStatus[t];
                    const isOccupied = status === "OPEN" || status === "PAYING";
                    return (
                      <button
                        key={t}
                        onClick={() => !isOccupied && transferTable(t)}
                        disabled={isOccupied}
                        className={`h-14 rounded-2xl font-black text-lg transition-all border-2 relative
                          ${isOccupied
                            ? "bg-stone-50 border-stone-100 text-stone-300 cursor-not-allowed"
                            : "bg-white border-primary/20 text-primary hover:border-primary hover:bg-orange-50 hover:scale-110 shadow-sm active:scale-95"
                          }`}
                        title={isOccupied ? `Bàn ${t} đang có khách` : `Chuyển sang bàn ${t}`}
                      >
                        {t}
                        {isOccupied && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-400 rounded-full border-2 border-white"></span>
                        )}
                      </button>
                    );
                  })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-6 pt-4 border-t border-stone-100">
                <div className="flex items-center gap-2">
                   <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(234,88,12,0.4)]"></div>
                   <span className="text-xs font-bold text-on-surface-variant">Trống - Có thể chuyển</span>
                </div>
                <div className="flex items-center gap-2">
                   <div className="w-3 h-3 rounded-full bg-stone-300"></div>
                   <span className="text-xs font-bold text-on-surface-variant/60">Có khách - Không thể</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}



        </div>
      </main>
    </div>
  );
}





