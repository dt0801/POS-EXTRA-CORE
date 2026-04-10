import { useState, useEffect, useCallback, useMemo } from "react";
import "./App.css";
import {
  parseKitchenCategoriesList,
  firstKitchenCategoryId,
  kitchenCategoryDisplayLabel,
  effectiveKitchenCategory,
  buildMenuPosFilterChips,
  menuPosFilterLabel,
} from "./constants/kitchenCategories";
import { API_URL, isLocalQuayOrigin } from "./config/api";
import { isPosElectron } from "./services/electronPrint";
import {
  login as loginRequest,
  logout as logoutRequest,
  LOGIN_ERR_NETWORK,
  LOGIN_ERR_TIMEOUT,
} from "./services/authService";
import { usePrinterStatus } from "./hooks/usePrinterStatus";
import useAuthSession from "./hooks/useAuthSession";
import useOrderSession from "./hooks/useOrderSession";
import useTableActions from "./hooks/useTableActions";
import usePrintFlow from "./hooks/usePrintFlow";
import useMenuManagement from "./hooks/useMenuManagement";
import useTableManagement from "./hooks/useTableManagement";
import useSettingsPrinterManagement from "./hooks/useSettingsPrinterManagement";
import useI18n from "./hooks/useI18n";
import { calcTotal, calcTotalQty, filterMenu, formatMoney, menuImageSrc, removeTones } from "./utils/posHelpers";
import { centsToEuroInputString, parseEuroInputToCents } from "./utils/menuPriceInput";
import { readMenuCache, writeMenuCache } from "./utils/menuCache";
import SidebarItem from "./components/layout/SidebarItem";
import TablesView from "./components/views/TablesView";
import HistoryView from "./components/views/HistoryView";
import StatsView from "./components/views/StatsView";
import MobileOrderView from "./components/views/MobileOrderView";
import ReportBillSettingsSection from "./components/views/ReportBillSettingsSection";
import KitchenCategoriesSettingsSection from "./components/views/KitchenCategoriesSettingsSection";
import { fetchPrintPreviewHtml } from "./services/printPreviewApi";
import { receiptPayloadBillReprint } from "./utils/serverReceiptPayload";
import { openBillPrintWindow } from "./utils/openBillPrintWindow";

// =============================================
// CONSTANTS
// =============================================
const TOTAL_TABLES = 20;
const getLocalDateISO = () => {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().split("T")[0];
};
const getLocalMonthISO = () => getLocalDateISO().slice(0, 7);

function isPdfArrayBuffer(ab) {
  if (!ab || ab.byteLength < 5) return false;
  const u = new Uint8Array(ab);
  return u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46;
}

function base64ToPdfBlob(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: "application/pdf" });
}

// =============================================
// MAIN COMPONENT
// =============================================
export default function App() {
  const {
    authToken,
    setAuthToken,
    authUser,
    setAuthUser,
    authValidated,
    authedFetch,
  } = useAuthSession();
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const { language, toggleLanguage, t: tr, tPair: tt } = useI18n();

  // ----- CORE STATE -----
  const [menu, setMenu]               = useState([]);
  const [currentTable, setCurrentTable] = useState(null);
  const [tableStatus, setTableStatus] = useState({});       // { [tableNum]: "OPEN" | "PAID" }
  const [filter, setFilter]           = useState("ALL"); // key từ buildMenuPosFilterChips(settings)
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarView, setSidebarView] = useState("order");  // "order" | "manage" | "history" | "stats"

  // ----- SIDEBAR STATE -----
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  /** Trong màn Cài đặt: chung (máy in, CSS…) | reportBill (mẫu in 3 loại) */
  const [settingsPanel, setSettingsPanel] = useState("general");

  // Trạng thái kết nối máy in: null | "online" | "offline"
  const { printerStatus } = usePrinterStatus();

  // Responsive & Mobile Cart state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [showMobileCart, setShowMobileCart] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [splitModal,    setSplitModal]    = useState(false);
  const [splitTarget,   setSplitTarget]   = useState("");
  const [splitSelected, setSplitSelected] = useState([]);
  const [transferModal, setTransferModal] = useState(false);
  const [transferDest, setTransferDest] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [customLineModal, setCustomLineModal] = useState(false);
  const [customLineName, setCustomLineName] = useState("");
  const [customLinePrice, setCustomLinePrice] = useState("");
  const [customLineType, setCustomLineType] = useState("FOOD");
  const [customLineKitchenCat, setCustomLineKitchenCat] = useState("MAIN");
  const [customLineQty, setCustomLineQty] = useState("1");
  const [users, setUsers] = useState([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userSaving, setUserSaving] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    full_name: "",
    role: "staff",
  });

  const isAdmin = (authUser?.role || "staff") === "admin";

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
      if (err?.code === LOGIN_ERR_TIMEOUT) setLoginError(tr("loginTimeout"));
      else if (err?.code === LOGIN_ERR_NETWORK) setLoginError(tr("loginNetworkError"));
      else setLoginError(err.message || tr("loginFailed"));
    }
    setLoggingIn(false);
  };

  const handleLogout = async () => {
    await logoutRequest(authToken);
    setAuthToken("");
    setAuthUser(null);
    setSidebarView("order");
  };

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    setUserLoading(true);
    try {
      const res = await authedFetch(`${API_URL}/users`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tt("Không tải được user", "Benutzer können nicht geladen werden"));
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setUsers([]);
    }
    setUserLoading(false);
  }, [isAdmin, authedFetch, tt]);

  const createUser = async () => {
    if (!newUser.username || !newUser.password) {
      alert(tt("Nhập username và password", "Benutzername und Passwort eingeben"));
      return;
    }
    setUserSaving(true);
    try {
      const res = await authedFetch(`${API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tt("Không tạo được user", "Benutzer kann nicht erstellt werden"));
      setNewUser({ username: "", password: "", full_name: "", role: "staff" });
      fetchUsers();
    } catch (e) {
      alert(e.message || tt("Không tạo được user", "Benutzer kann nicht erstellt werden"));
    } finally {
      setUserSaving(false);
    }
  };

  const updateUser = async (u, patch) => {
    setUserSaving(true);
    try {
      const res = await authedFetch(`${API_URL}/users/${u.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tt("Không cập nhật được user", "Benutzer kann nicht aktualisiert werden"));
      fetchUsers();
    } catch (e) {
      alert(e.message || tt("Không cập nhật được user", "Benutzer kann nicht aktualisiert werden"));
    } finally {
      setUserSaving(false);
    }
  };

  const deleteUser = async (u) => {
    if (!window.confirm(`${tt("Xóa user", "Benutzer löschen")} ${u.username}?`)) return;
    setUserSaving(true);
    try {
      const res = await authedFetch(`${API_URL}/users/${u.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tt("Không xóa được user", "Benutzer kann nicht gelöscht werden"));
      fetchUsers();
    } catch (e) {
      alert(e.message || tt("Không xóa được user", "Benutzer kann nicht gelöscht werden"));
    } finally {
      setUserSaving(false);
    }
  };

  useEffect(() => {
    if (sidebarView === "users" && isAdmin && authValidated) {
      fetchUsers();
    }
  }, [sidebarView, isAdmin, authValidated, fetchUsers]);

  const {
    tableOrders,
    setTableOrders,
    kitchenSent,
    setKitchenSent,
    itemNotes,
    setItemNotes,
    orderSessionReady,
  } = useOrderSession({ authedFetch, authToken, authValidated });

  // ----- MANAGE STATE -----
  const [manageTab, setManageTab]   = useState("edit");
  const [newItem, setNewItem]       = useState({ name: "", type: "FOOD", kitchen_category: "MAIN" });
  const [menuManagePriceEuro, setMenuManagePriceEuro] = useState("");
  const [file, setFile]             = useState(null);
  const [editItem, setEditItem]     = useState(null);
  const [editFile, setEditFile]     = useState(null);

  // ----- TABLE MANAGE STATE -----
  const [tableList, setTableList]       = useState([]);
  const [newTableNum, setNewTableNum]   = useState("");
  const [editingTable, setEditingTable] = useState(null);

  // ----- HISTORY STATE -----
  const [bills, setBills]             = useState([]);
  const [historyDate, setHistoryDate] = useState(getLocalDateISO());
  const [statsTab, setStatsTab] = useState("day");
  const statsMonth = getLocalMonthISO();
  const statsYear = String(new Date().getFullYear());
  const [statsToday, setStatsToday] = useState({ bill_count: 0, revenue: 0, top_items: [] });
  const [statsMonthlyData, setStatsMonthlyData] = useState({ bill_count: 0, revenue: 0, days: [], top_items: [] });
  const [statsYearlyData, setStatsYearlyData] = useState({ bill_count: 0, revenue: 0, months: [], top_items: [] });
  const [selectedBill, setSelectedBill] = useState(null); // chi tiết bill đang xem
  const {
    settings,
    setSettings,
    settingsSaved,
    settingsSaving,
    saveAllSettings,
    mergeAndSaveSettings,
    windowsPrinters,
    fetchWindowsPrinters,
    fetchDbPrinters,
    dbPrinters,
    loadingDbPrinters,
    newPrinter,
    setNewPrinter,
    addDbPrinter,
    updateDbPrinter,
    deleteDbPrinter,
  } = useSettingsPrinterManagement({
    authUser,
    authValidated,
    sidebarView,
    authedFetch,
  });

  const kitchenCategoriesJson = settings.kitchen_categories_json;
  const kitchenCategoriesList = useMemo(
    () => parseKitchenCategoriesList({ kitchen_categories_json: kitchenCategoriesJson }),
    [kitchenCategoriesJson]
  );
  const defaultKitchenCategoryId = useMemo(
    () => firstKitchenCategoryId({ kitchen_categories_json: kitchenCategoriesJson }),
    [kitchenCategoriesJson]
  );

  const menuPosFilters = useMemo(
    () => buildMenuPosFilterChips({ kitchen_categories_json: kitchenCategoriesJson }),
    [kitchenCategoriesJson]
  );

  useEffect(() => {
    const valid = new Set(menuPosFilters.map((f) => f.key));
    if (!valid.has(filter)) setFilter("ALL");
  }, [menuPosFilters, filter, setFilter]);

  // ----- DERIVED -----
  // Danh sách số bàn – lấy từ tableList (đã merge DB + settings)
  // fallback về 1..20 nếu tableList chưa load xong
  const tables = tableList.length > 0
    ? tableList.map(t => t.table_num)
    : Array.from({ length: TOTAL_TABLES }, (_, i) => i + 1);

  const currentItems  = Object.values(tableOrders[currentTable] || {});
  const total         = calcTotal(tableOrders[currentTable]);
  const filteredMenu = useMemo(() => {
    const byTab = filterMenu(menu, filter, settings);
    if (!searchQuery) return byTab;
    const queryStr = removeTones(searchQuery);
    return byTab.filter(m => removeTones(m.name).includes(queryStr));
  }, [menu, filter, searchQuery, settings]);
  
  // =============================================
  // DATA FETCHING
  // =============================================

  const fetchMenu = useCallback(async () => {
    const cached = readMenuCache();
    if (cached?.length) setMenu(cached);
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
      writeMenuCache(normalized);
    } catch (e) {
      console.error("Lỗi fetch menu:", e);
      if (!cached?.length) setMenu([]);
    }
  }, [authedFetch]);

  /** Fetch trạng thái tất cả bàn từ server */
  const fetchTableStatus = useCallback(() => {
    authedFetch(`${API_URL}/tables`)
      .then(async (r) => {
        if (!r.ok) return null;
        const rows = await r.json();
        return Array.isArray(rows) ? rows : null;
      })
      .then((rows) => {
        if (!rows) return;
        const map = {};
        rows.forEach((r) => {
          map[r.table_num] = r.status;
        });
        setTableStatus(map);
      })
      .catch((e) => console.error("Lỗi fetch tables:", e));
  }, [authedFetch]);

  /** Fetch lịch sử hóa đơn theo ngày */
  const fetchBills = useCallback((date) => {
    authedFetch(`${API_URL}/bills?date=${encodeURIComponent(date)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => []);
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data;
      })
      .then((data) => setBills(Array.isArray(data) ? data : []))
      .catch(e => {
        console.error("Lỗi fetch bills:", e);
        setBills([]);
      });
  }, [authedFetch]);

  const fetchStatsToday = useCallback(() => {
    authedFetch(`${API_URL}/stats/today`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data;
      })
      .then((data) => setStatsToday({
        bill_count: Number(data?.bill_count || 0),
        revenue: Number(data?.revenue || 0),
        top_items: Array.isArray(data?.top_items) ? data.top_items : [],
      }))
      .catch(() => setStatsToday({ bill_count: 0, revenue: 0, top_items: [] }));
  }, [authedFetch]);

  const fetchStatsMonthly = useCallback((month) => {
    authedFetch(`${API_URL}/stats/monthly?month=${encodeURIComponent(month)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data;
      })
      .then((data) => setStatsMonthlyData({
        bill_count: Number(data?.bill_count || 0),
        revenue: Number(data?.revenue || 0),
        days: Array.isArray(data?.days) ? data.days : [],
        top_items: Array.isArray(data?.top_items) ? data.top_items : [],
      }))
      .catch(() => setStatsMonthlyData({ bill_count: 0, revenue: 0, days: [], top_items: [] }));
  }, [authedFetch]);

  const fetchStatsYearly = useCallback((year) => {
    authedFetch(`${API_URL}/stats/yearly?year=${encodeURIComponent(year)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data;
      })
      .then((data) => setStatsYearlyData({
        bill_count: Number(data?.bill_count || 0),
        revenue: Number(data?.revenue || 0),
        months: Array.isArray(data?.months) ? data.months : [],
        top_items: Array.isArray(data?.top_items) ? data.top_items : [],
      }))
      .catch(() => setStatsYearlyData({ bill_count: 0, revenue: 0, months: [], top_items: [] }));
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
      authedFetch(`${API_URL}/tables`).then(async (r) => {
        if (!r.ok) throw new Error(`tables ${r.status}`);
        const data = await r.json();
        return Array.isArray(data) ? data : [];
      }),
      authedFetch(`${API_URL}/settings`).then(async (r) => {
        if (!r.ok) throw new Error(`settings ${r.status}`);
        return r.json();
      }),
    ])
      .then(([rows, cfg]) => {
        const settingTotal = Number(cfg?.total_tables) || 20;
        const dbMax = rows.reduce((max, r) => Math.max(max, r.table_num), 0);
        const total = Math.max(settingTotal, dbMax);
        const dbMap = {};
        rows.forEach((r) => {
          dbMap[r.table_num] = r.status;
        });
        const full = Array.from({ length: total }, (_, i) => ({
          table_num: i + 1,
          status: dbMap[i + 1] || "PAID",
        }));
        setTableList(full);
      })
      .catch(() => {});
  }, [authedFetch]);

  // Chỉ tải dữ liệu POS khi phiên đã được /auth/me xác nhận (tránh race với token hết hạn trong storage)
  useEffect(() => {
    if (!authUser || !authValidated) return;
    fetchMenu();
    fetchTableStatus();
    fetchTableList();
  }, [authUser, authValidated, fetchMenu, fetchTableStatus, fetchTableList]);

  // Khi vào tab manage → reload lại danh sách bàn cho chắc
  useEffect(() => {
    if (sidebarView === "manage" && authUser && authValidated) fetchTableList();
  }, [sidebarView, authUser, authValidated, fetchTableList]);

  // Khi chuyển sang tab history → load bills của ngày đang chọn
  useEffect(() => {
    if (sidebarView === "history" && authUser && authValidated) fetchBills(historyDate);
  }, [sidebarView, authUser, authValidated, historyDate, fetchBills]);

  useEffect(() => {
    if (sidebarView !== "settings") setSettingsPanel("general");
  }, [sidebarView]);

  useEffect(() => {
    if (!authUser || !isAdmin || !authValidated) return;
    fetchStatsToday();
  }, [authUser, isAdmin, authValidated, fetchStatsToday]);

  useEffect(() => {
    if (!authUser || !isAdmin || !authValidated) return;
    fetchStatsMonthly(statsMonth);
  }, [authUser, isAdmin, authValidated, statsMonth, fetchStatsMonthly]);

  useEffect(() => {
    if (!authUser || !isAdmin || !authValidated) return;
    fetchStatsYearly(statsYear);
  }, [authUser, isAdmin, authValidated, statsYear, fetchStatsYearly]);

  // =============================================
  // TABLE STATUS & ORDER/PRINT FLOW
  // =============================================

  useEffect(() => {
    if (!authUser) return;
    if (!isAdmin && ["manage", "history", "stats", "settings", "users"].includes(sidebarView)) {
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

  const { addItem, addCustomLineItem, updateQty, removeItem, resetTable, transferTable, executeSplit } = useTableActions({
    orderSessionReady,
    currentTable,
    tableStatus,
    currentItems,
    splitTarget,
    splitSelected,
    defaultKitchenCategoryId,
    setTableOrders,
    setKitchenSent,
    setItemNotes,
    updateTableStatus,
    setTableStatus,
    setCurrentTable,
    setSplitModal,
    setSplitSelected,
    setSplitTarget,
  });

  const { callPrintApi, printOrderTicket, handlePayment, printTamTinh } = usePrintFlow({
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
  });

  const handleReprintBill = useCallback(
    async (bill) => {
      try {
        const data = await callPrintApi(`/print/bill/${bill.id}`, {});
        // Render/cloud: mặc định PRINT_DISPATCH_MODE=queue → chỉ tạo job, không in trên trình duyệt
        if (data && data.job_id != null) {
          alert(
            tt(
              `Đã xếp hàng in trên server (job #${data.job_id}). Trên cloud không tự in ra giấy — mở Print Bridge ở máy quầy, hoặc bấm «Tải PDF».`,
              `Druckauftrag #${data.job_id} auf dem Server. In der Cloud kein direkter Druck — Print Bridge am PC oder «PDF herunterladen».`
            )
          );
        }
      } catch {
        try {
          const html = await fetchPrintPreviewHtml({
            receipt: receiptPayloadBillReprint({ bill }),
            paper_size: 80,
            css_override: settings.bill_css_override || "",
          });
          openBillPrintWindow(html);
        } catch (e2) {
          alert(e2.message || "Không in được hóa đơn");
        }
      }
    },
    [callPrintApi, settings, tt]
  );

  const handleDownloadBillPdf = useCallback(
    async (bill) => {
      const pdfUrl = `${API_URL}/bills/${bill.id}/pdf`;
      const triggerSave = (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `hoa-don-${bill.id}.pdf`;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      };

      const tryBinary = async () => {
        const res = await authedFetch(pdfUrl, {
          cache: "no-store",
          headers: { Accept: "application/pdf" },
        });
        if (!res.ok) {
          let err = {};
          try {
            err = await res.json();
          } catch {
            /* ignore */
          }
          throw new Error(err.error || err.detail || "Không tải được PDF");
        }
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (!ct.includes("application/pdf")) {
          const text = await res.text();
          throw new Error(
            text && text.length < 400
              ? text
              : "Server không trả application/pdf (kiểm tra proxy/API URL)."
          );
        }
        const buf = await res.arrayBuffer();
        if (!isPdfArrayBuffer(buf) || buf.byteLength < 100) {
          throw new Error("__FALLBACK_BASE64__");
        }
        return new Blob([buf], { type: "application/pdf" });
      };

      const tryBase64 = async () => {
        const res = await authedFetch(`${pdfUrl}?format=base64`, { cache: "no-store" });
        if (!res.ok) {
          let err = {};
          try {
            err = await res.json();
          } catch {
            /* ignore */
          }
          throw new Error(err.error || err.detail || "Không tải PDF (base64)");
        }
        const j = await res.json();
        if (!j.data || typeof j.data !== "string") {
          throw new Error("Server không trả data base64");
        }
        const blob = base64ToPdfBlob(j.data);
        const check = await blob.arrayBuffer();
        if (!isPdfArrayBuffer(check) || check.byteLength < 100) {
          throw new Error("Base64 không phải PDF hợp lệ");
        }
        return new Blob([check], { type: "application/pdf" });
      };

      try {
        let blob;
        try {
          blob = await tryBinary();
        } catch (e) {
          if (e.message === "__FALLBACK_BASE64__") {
            blob = await tryBase64();
          } else {
            try {
              blob = await tryBase64();
            } catch {
              throw e;
            }
          }
        }
        triggerSave(blob);
      } catch (e) {
        alert(e.message || "Không tải được PDF");
      }
    },
    [authedFetch]
  );

  const { addMenu, updateMenu, deleteMenu, menuSaving } = useMenuManagement({
    authedFetch,
    newItem,
    file,
    setNewItem,
    setFile,
    editItem,
    editFile,
    setEditItem,
    setEditFile,
    fetchMenu,
    defaultKitchenCategoryId,
  });

  const { tableMsg, tableSaving, addTable, renameTable, deleteTable } = useTableManagement({
    authedFetch,
    tableList,
    setTableList,
    newTableNum,
    setNewTableNum,
    editingTable,
    setEditingTable,
    fetchTableList,
    fetchTableStatus,
  });

  // =============================================
  // RENDER HELPERS
  // =============================================

  // =============================================
  // RENDER
  // =============================================
  if (!authUser) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-container p-6">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-surface p-6 rounded-2xl border border-outline-variant/30 shadow-sm space-y-4">
          <h1 className="text-xl font-bold text-on-surface">{tr("loginTitle")}</h1>
          <input
            className="w-full border border-outline-variant/40 rounded-xl px-4 py-2.5 bg-surface-container-lowest"
            placeholder={tr("username")}
            value={loginForm.username}
            onChange={(e) => setLoginForm((s) => ({ ...s, username: e.target.value }))}
          />
          <input
            type="password"
            className="w-full border border-outline-variant/40 rounded-xl px-4 py-2.5 bg-surface-container-lowest"
            placeholder={tr("password")}
            value={loginForm.password}
            onChange={(e) => setLoginForm((s) => ({ ...s, password: e.target.value }))}
          />
          {loginError ? <div className="text-sm text-error">{loginError}</div> : null}
          <button
            type="submit"
            disabled={loggingIn || !loginForm.username || !loginForm.password}
            className="w-full rounded-xl bg-primary text-white py-2.5 font-bold disabled:opacity-60"
          >
            {loggingIn ? tr("loggingIn") : tr("login")}
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
              {tt("Tách bàn", "Tisch aufteilen")} {currentTable}
            </h3>

            <div className="space-y-8">
              {/* Item Selection */}
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-4 uppercase tracking-widest">
                  {tt("Chọn món muốn chuyển sang bàn khác", "Wähle die Gerichte zum Verschieben")}
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
                         <p className="text-xs text-on-surface-variant font-medium">x{item.qty} {tt("món", "Gerichte")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Destination Selection */}
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-4 uppercase tracking-widest">
                  {tt("Chuyển sang bàn nào?", "Zu welchem Tisch verschieben?")}
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
                  {tt("Xác nhận Tách bàn", "Aufteilen bestätigen")}
                </button>
                <button onClick={() => setSplitModal(false)}
                  className="px-8 bg-surface-container-highest hover:bg-outline-variant/50 text-on-surface-variant hover:text-on-surface py-4 rounded-2xl font-black text-lg transition-all active:scale-95">
                  {tt("Hủy", "Abbrechen")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL CHUYỂN BÀN (toàn bộ đơn) ==================== */}
      {transferModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-[2.5rem] p-8 md:p-10 border border-outline-variant/30 shadow-2xl max-w-2xl w-full relative animate-in fade-in zoom-in-95 duration-200">
            <button
              type="button"
              disabled={transferSubmitting}
              onClick={() => {
                if (transferSubmitting) return;
                setTransferModal(false);
                setTransferDest("");
              }}
              className="absolute top-6 right-6 w-12 h-12 bg-surface-container-high hover:bg-outline-variant/30 text-on-surface flex items-center justify-center rounded-full transition-colors shadow-sm disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-2xl">close</span>
            </button>

            <h3 className="text-3xl font-black font-headline mb-2 text-on-surface flex items-center gap-3 pr-14">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-3xl">sync_alt</span>
              </div>
              {tt("Chuyển bàn", "Tisch wechseln")}
            </h3>
            <p className="text-sm text-on-surface-variant mb-6 pl-[4.5rem] md:pl-0">
              {tt(
                "Chuyển toàn bộ món và ghi chú sang bàn trống. Bàn hiện tại sẽ được giải phóng.",
                "Gesamte Bestellung und Notizen an einen freien Tisch. Aktueller Tisch wird frei."
              )}
            </p>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-4 uppercase tracking-widest">
                  {tt("Chọn bàn đích", "Zieltisch wählen")}
                </label>
                <div className="grid grid-cols-5 sm:grid-cols-8 gap-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                  {tables
                    .filter((t) => t !== currentTable)
                    .map((t) => {
                      const busy = tableStatus[t] === "OPEN" || tableStatus[t] === "PAYING";
                      return (
                        <button
                          key={t}
                          type="button"
                          disabled={busy || transferSubmitting}
                          onClick={() => {
                            if (busy || transferSubmitting) return;
                            setTransferDest(t);
                          }}
                          className={`h-12 rounded-2xl font-black text-sm transition-all border-2 relative
                            ${busy
                              ? "border-stone-100 bg-stone-100 text-stone-300 cursor-not-allowed opacity-60"
                              : transferDest === t
                                ? "bg-primary border-primary text-white shadow-lg shadow-orange-300/40 scale-105"
                                : "border-stone-200 bg-white text-stone-600 hover:border-primary/30 hover:text-primary"}`}
                        >
                          {t}
                          {busy && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-stone-400 rounded-full border-2 border-white" title={tt("Đang có khách", "Besetzt")} />
                          )}
                        </button>
                      );
                    })}
                </div>
                <p className="text-xs text-on-surface-variant mt-3">
                  {tt("Chỉ chọn bàn trống (không đang ORDER).", "Nur freie Tische (nicht in Bedienung).")}
                </p>
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  disabled={!transferDest || transferSubmitting}
                  onClick={async () => {
                    if (!transferDest || transferSubmitting) return;
                    setTransferSubmitting(true);
                    try {
                      await transferTable(transferDest);
                      setTransferModal(false);
                      setTransferDest("");
                      if (isMobile) setShowMobileCart(false);
                    } finally {
                      setTransferSubmitting(false);
                    }
                  }}
                  className={`flex-1 py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95
                    ${transferDest && !transferSubmitting
                      ? "bg-gradient-to-br from-primary to-orange-600 text-white shadow-orange-300/40"
                      : "bg-stone-200 text-stone-400 cursor-not-allowed shadow-none"}`}
                >
                  <span className={`material-symbols-outlined text-2xl ${transferSubmitting ? "animate-spin" : ""}`}>
                    {transferSubmitting ? "progress_activity" : "sync_alt"}
                  </span>
                  {transferSubmitting ? tt("Đang chuyển...", "Wird verschoben...") : tt("Xác nhận chuyển bàn", "Verschieben bestätigen")}
                </button>
                <button
                  type="button"
                  disabled={transferSubmitting}
                  onClick={() => {
                    if (transferSubmitting) return;
                    setTransferModal(false);
                    setTransferDest("");
                  }}
                  className="px-8 bg-surface-container-highest hover:bg-outline-variant/50 text-on-surface-variant hover:text-on-surface py-4 rounded-2xl font-black text-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  {tt("Hủy", "Abbrechen")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL MÓN NGOÀI MENU (không lưu thực đơn) ==================== */}
      {customLineModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-[2rem] p-6 md:p-8 border border-outline-variant/30 shadow-2xl max-w-md w-full relative">
            <button
              type="button"
              onClick={() => setCustomLineModal(false)}
              className="absolute top-4 right-4 w-10 h-10 bg-surface-container-high hover:bg-outline-variant/30 text-on-surface flex items-center justify-center rounded-full transition-colors"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
            <h3 className="text-xl font-black font-headline mb-1 text-on-surface flex items-center gap-2 pr-10">
              <span className="material-symbols-outlined text-primary">post_add</span>
              {tt("Món ngoài menu", "Außerhalb Speisekarte")}
            </h3>
            <p className="text-xs text-on-surface-variant mb-5 leading-relaxed">
              {tt(
                "Chỉ thêm vào bill hiện tại — không tạo món trong thực đơn hay database.",
                "Nur für diese Rechnung — kein Menüeintrag in der Datenbank."
              )}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">{tt("Tên món", "Gerichtname")}</label>
                <input
                  value={customLineName}
                  onChange={(e) => setCustomLineName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/40 text-on-surface font-semibold outline-none focus:ring-2 focus:ring-primary/25"
                  placeholder={tt("VD: Phụ thu, món lẻ…", "z.B. Zuschlag…")}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">{tt("Giá (EUR)", "Preis (EUR)")}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={customLinePrice}
                    onChange={(e) => setCustomLinePrice(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/40 text-on-surface font-semibold outline-none focus:ring-2 focus:ring-primary/25"
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">{tt("SL", "Menge")}</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={customLineQty}
                    onChange={(e) => setCustomLineQty(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/40 text-on-surface font-semibold outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">{tt("Loại", "Typ")}</label>
                <select
                  value={customLineType}
                  onChange={(e) => setCustomLineType(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/40 text-on-surface font-semibold outline-none focus:ring-2 focus:ring-primary/25"
                >
                  <option value="FOOD">{tt("Đồ ăn (bếp)", "Essen (Küche)")}</option>
                  <option value="DRINK">{tt("Đồ uống (pha chế)", "Getränk (Bar)")}</option>
                </select>
              </div>
              {customLineType === "FOOD" && (
                <div>
                  <label className="block text-[11px] font-bold text-on-surface-variant uppercase mb-1">{tt("Nhóm in bếp", "Küchen-Gruppe")}</label>
                  <select
                    value={customLineKitchenCat}
                    onChange={(e) => setCustomLineKitchenCat(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/40 text-on-surface font-semibold outline-none focus:ring-2 focus:ring-primary/25"
                  >
                    {kitchenCategoriesList.map((o) => (
                      <option key={o.id} value={o.id}>
                        {language === "de" ? o.labelDe || o.labelVi : o.labelVi}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCustomLineModal(false)}
                  className="flex-1 py-3 rounded-xl font-bold bg-surface-container-highest text-on-surface-variant"
                >
                  {tt("Hủy", "Abbrechen")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const euro = parseFloat(String(customLinePrice).replace(",", ".").trim(), 10);
                    if (!customLineName.trim()) {
                      alert(tt("Nhập tên món.", "Gerichtname eingeben."));
                      return;
                    }
                    if (!Number.isFinite(euro) || euro < 0) {
                      alert(tt("Giá không hợp lệ.", "Ungültiger Preis."));
                      return;
                    }
                    addCustomLineItem({
                      name: customLineName,
                      priceCents: Math.round(euro * 100),
                      type: customLineType,
                      kitchen_category: customLineType === "DRINK" ? "" : customLineKitchenCat,
                      qty: Math.max(1, Math.min(99, parseInt(customLineQty, 10) || 1)),
                    });
                    setCustomLineModal(false);
                  }}
                  className="flex-1 py-3 rounded-xl font-bold bg-primary text-white shadow-md"
                >
                  {tt("Thêm vào bill", "Zur Rechnung")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== LEFT SIDEBAR (Desktop Version) ==================== */}
      <aside className={`hidden md:flex h-screen ${isSidebarExpanded ? "w-64" : "w-[88px]"} bg-surface flex-col py-6 space-y-4 shadow-sm shrink-0 transition-all duration-300 z-10 border-r border-outline-variant/20 relative`}>
        {/* Toggle Button / Logo Area */}
        <div className={`flex items-center ${isSidebarExpanded ? "px-6 justify-between" : "justify-center"} mb-4`}>
          {isSidebarExpanded && (
            <div className="flex flex-col overflow-hidden">
              <h1 className="text-xl font-black text-primary font-headline whitespace-nowrap">Citrus POS</h1>
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
          <SidebarItem icon="grid_view" label={tr("floorMap")} view="tables" isActive={sidebarView === "tables"} isSidebarExpanded={isSidebarExpanded} onClick={() => setSidebarView("tables")} />
          <SidebarItem icon="restaurant_menu" label={tr("orderMenu")} view="order" isActive={sidebarView === "order"} isSidebarExpanded={isSidebarExpanded} onClick={() => setSidebarView("order")} />
          {isAdmin && <SidebarItem icon="format_list_bulleted" label={tr("menuManagement")} view="manage" isActive={sidebarView === "manage"} isSidebarExpanded={isSidebarExpanded} onClick={() => setSidebarView("manage")} />}
          {isAdmin && <SidebarItem icon="receipt_long" label={tr("billHistory")} view="history" isActive={sidebarView === "history"} isSidebarExpanded={isSidebarExpanded} onClick={() => setSidebarView("history")} />}
          {isAdmin && <SidebarItem icon="trending_up" label={tr("statsReport")} view="stats" isActive={sidebarView === "stats"} isSidebarExpanded={isSidebarExpanded} onClick={() => setSidebarView("stats")} />}
          {isAdmin && <SidebarItem icon="group" label={tr("userManagement")} view="users" isActive={sidebarView === "users"} isSidebarExpanded={isSidebarExpanded} onClick={() => setSidebarView("users")} />}
          {isAdmin && <SidebarItem icon="settings" label={tr("systemSettings")} view="settings" isActive={sidebarView === "settings"} isSidebarExpanded={isSidebarExpanded} onClick={() => setSidebarView("settings")} />}
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
            <div title={printerStatus === "online" ? tt("Máy in: Online", "Drucker: Online") : tt("Máy in: Offline", "Drucker: Offline")} className="flex flex-col items-center gap-1">
               <span className="material-symbols-outlined text-[20px]">print</span>
               <span className={`w-2 h-2 rounded-full ${printerStatus === "online" ? "bg-green-400" : printerStatus === "offline" ? "bg-error" : "bg-yellow-400 animate-pulse"}`}/>
            </div>
            {isAdmin ? (
              <button onClick={() => authedFetch(`${API_URL}/open-log`, { method: "POST" })} className="hover:text-primary transition-colors hover:bg-surface-variant rounded-full p-2" title={tr("openLog")}>
                <span className="material-symbols-outlined text-[20px]">terminal</span>
              </button>
            ) : null}
            <button onClick={toggleLanguage} className="hover:text-primary transition-colors hover:bg-surface-variant rounded-full p-2 text-[10px] font-black min-w-[40px]" title={tr("switchLanguage")}>
              {language.toUpperCase()}
            </button>
            <button onClick={handleLogout} className="hover:text-primary transition-colors hover:bg-surface-variant rounded-full p-2" title={tr("logout")}>
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
          
        </div>
      </aside>

      {/* ==================== CONTENT PANEL (Stitch Version) ==================== */}
      <main className="flex-1 flex flex-col overflow-hidden bg-surface-container relative pb-safe">

        {/* ==================== MOBILE TOP APP BAR ==================== */}
        <header className="md:hidden sticky top-0 z-40 bg-stone-50/90 backdrop-blur-md dark:bg-stone-950/90 shrink-0">
          <div className="flex items-center gap-3 w-full px-4 py-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="material-symbols-outlined text-orange-600 dark:text-orange-500">restaurant_menu</span>
              <h1 className="text-lg font-extrabold tracking-tighter text-stone-900 dark:text-stone-50 font-headline truncate">{settings.store_name || "Citrus POS"}</h1>
            </div>

            {sidebarView === "order" && (
              <div className="relative shrink-0 w-[150px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 material-symbols-outlined scale-75">search</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={tt("Tìm món ăn...", "Gericht suchen...")}
                  className="w-full pl-9 pr-3 py-2 bg-surface-container-high rounded-full border border-outline-variant/30 focus:border-primary outline-none focus:ring-2 focus:ring-primary/20 text-sm transition-all"
                />
              </div>
            )}

            <button
              onClick={toggleLanguage}
              className="shrink-0 text-orange-600 dark:text-orange-500 active:scale-95 transition-transform duration-200 font-black text-xs px-2 py-1 rounded-lg border border-orange-200/60"
              title={tr("switchLanguage")}
            >
              {language.toUpperCase()}
            </button>
          </div>
          <div className="bg-stone-200/50 dark:bg-stone-800/50 h-[1px] w-full"></div>
        </header>

        <div className="flex-1 flex overflow-hidden">

      {/* ==================== CONTENT ROUTER ==================== */}
      <div className="flex-1 px-2 md:p-6 lg:p-10 flex flex-col overflow-hidden w-full max-w-[1600px] mx-auto pb-24 md:pb-6">
      {!isAdmin && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900 mx-2 md:mx-0">
          {tt("Bạn đang ở ", "Sie sind im ")}<strong>{tt("màn hình nhân viên", "Mitarbeiter-Modus")}</strong>{tt(": chỉ được thao tác Order, gửi bếp và tạm tính.", ": nur Bestellung, Küche senden und Zwischenrechnung sind erlaubt.")}
        </div>
      )}

      {sidebarView === "tables" && (
        <TablesView
          tables={tables}
          tableStatus={tableStatus}
          tableOrders={tableOrders}
          calcTotalQty={calcTotalQty}
          formatMoney={formatMoney}
          setCurrentTable={setCurrentTable}
          setSidebarView={setSidebarView}
          language={language}
        />
      )}

        {/* ===== ORDER VIEW ===== */}
        {sidebarView === "order" && (
          isMobile ? (
            <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden -mx-2">
            <MobileOrderView
              menu={menu}
              filter={filter}
              setFilter={setFilter}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              currentTable={currentTable}
              tableOrders={tableOrders}
              total={total}
              calcTotalQty={calcTotalQty}
              addItem={addItem}
              updateQty={updateQty}
              formatMoney={formatMoney}
              menuImageSrc={menuImageSrc}
              sidebarView={sidebarView}
              setSidebarView={setSidebarView}
              setShowMobileCart={setShowMobileCart}
              language={language}
              settings={settings}
              menuPosFilters={menuPosFilters}
            />
            </div>
          ) : (
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden gap-4 lg:gap-6 lg:-m-6 lg:p-6">
              
              {/* Middle: Menu Grid Area */}
              <div className="flex-1 flex flex-col gap-4 lg:gap-6 overflow-hidden">
                 {/* Custom Category Tabs + Search */}
                 <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar shrink-0 px-2 lg:px-0">
                   {/* Search */}
                   <div className="relative shrink-0 mr-2">
                     <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 material-symbols-outlined scale-75">search</span>
                     <input
                       type="text"
                      placeholder={tt("Tìm món ăn...", "Gericht suchen...")}
                       value={searchQuery}
                       onChange={(e) => setSearchQuery(e.target.value)}
                       className="pl-10 pr-4 py-2 bg-surface-container-high rounded-full border border-outline-variant/30 focus:border-primary outline-none focus:ring-2 focus:ring-primary/20 text-sm w-40 lg:w-48 focus:w-56 lg:focus:w-64 transition-all"
                     />
                   </div>
                   {/* Tabs */}
                   {menuPosFilters.map((f) => (
                     <button key={f.key} onClick={() => setFilter(f.key)}
                       className={`px-4 lg:px-6 py-2 lg:py-2.5 font-headline font-semibold lg:font-bold rounded-xl shadow-sm transition-all whitespace-nowrap text-sm lg:text-base
                         ${filter === f.key ? "bg-primary text-white shadow-md shadow-orange-500/30" : "bg-surface-container-lowest text-on-surface-variant hover:bg-orange-50 dark:hover:bg-stone-800"}`}
                     >{menuPosFilterLabel(f, language)}</button>
                   ))}
                 </div>

                 {/* Bento Grid Menu */}
                 <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {menu.length === 0 ? (
                    <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-on-surface-variant border-2 border-dashed border-outline-variant/40 rounded-3xl bg-surface-container-lowest">
                      <span className="material-symbols-outlined text-5xl mb-3 opacity-40">restaurant_menu</span>
                      <p className="font-bold text-base">{tt("Chưa có dữ liệu menu", "Keine Menüdaten vorhanden")}</p>
                      <p className="text-sm mt-1">{tt("Vui lòng seed menu ở backend hoặc kiểm tra API `/menu`.", "Bitte Menüdaten im Backend einspielen oder API `/menu` prüfen.")}</p>
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
                              <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-2.5 py-0.5 rounded-full text-[10px] font-bold text-primary shadow-sm">{m.type === "FOOD" ? tt("Món ăn", "Essen") : m.type === "DRINK" ? tt("Đồ uống", "Getränk") : "Combo"}</div>
                            </div>
                            <div className="p-3.5 flex flex-col flex-1">
                              <h3 className="font-headline font-bold text-stone-900 line-clamp-2 leading-tight mb-1 text-sm">{m.name}</h3>
                              <p className="text-[11px] font-semibold text-stone-500 mb-3">{m.type === "FOOD" ? tt("Món ăn", "Essen") : m.type === "DRINK" ? tt("Đồ uống", "Getränk") : "Combo"}</p>
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
                    <h2 className="font-headline font-black text-xl text-stone-900">{tt("Bàn", "Tisch")} {currentTable || "--"}</h2>
                     <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">
                       {currentTable ? (
                          tableStatus[currentTable] === "OPEN" ? `ORDER #${new Date().getTime().toString().slice(-4)}` :
                         tableStatus[currentTable] === "PAYING" ? tt("CHỜ RESET", "WARTET AUF RESET") : tt("TRỐNG", "FREI")
                       ) : tt("Chưa chọn bàn", "Kein Tisch gewählt")}
                     </span>
                   </div>
                   {tableStatus[currentTable] === "OPEN" && (
                     <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTransferDest("");
                          setTransferModal(true);
                        }}
                        disabled={currentItems.length === 0}
                        className="w-10 h-10 bg-orange-100 rounded-[1.2rem] flex items-center justify-center text-orange-600 hover:bg-orange-200 transition-all disabled:opacity-50 shadow-sm border border-orange-200/50 group/btn"
                        title={tt("Chuyển bàn", "Tisch wechseln")}
                      >
                         <span className="material-symbols-outlined text-[20px]">sync_alt</span>
                       </button>
                       <button
                         type="button"
                         onClick={() => {
                           setCustomLineName("");
                           setCustomLinePrice("");
                           setCustomLineType("FOOD");
                           setCustomLineKitchenCat(defaultKitchenCategoryId);
                           setCustomLineQty("1");
                           setCustomLineModal(true);
                         }}
                         disabled={!currentTable}
                         className="w-10 h-10 bg-violet-100 rounded-[1.2rem] flex items-center justify-center text-violet-700 hover:bg-violet-200 transition-all disabled:opacity-50 shadow-sm border border-violet-200/60"
                         title={tt("Món ngoài menu", "Außerhalb Speisekarte")}
                       >
                         <span className="material-symbols-outlined text-[20px]">post_add</span>
                       </button>
                       <button onClick={() => { setSplitSelected([]); setSplitTarget(""); setSplitModal(true); }} disabled={currentItems.length === 0} className="w-10 h-10 bg-stone-100 rounded-[1.2rem] flex items-center justify-center text-stone-500 hover:bg-stone-200 hover:text-stone-800 transition-all disabled:opacity-50 shadow-sm border border-stone-200" title={tt("Tách bàn", "Tisch aufteilen")}>
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
                        <p className="text-sm font-semibold">{tt("Chưa có món nào", "Noch keine Gerichte")}</p>
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
                            {item.is_custom_line && (
                              <span className="inline-flex w-fit items-center px-1.5 py-px bg-violet-50 text-[9px] font-bold text-violet-700 rounded mt-0.5">
                                {tt("Ngoài menu", "Extra")}
                              </span>
                            )}
                            {newQty > 0 && (
                              <span className="inline-flex w-fit items-center px-1.5 py-px bg-orange-50 text-[9px] font-bold text-orange-600 rounded mt-0.5">
                                + {newQty} {tt("món mới", "neu")}
                              </span>
                            )}
                            {note && <p className="text-[10px] text-stone-400 mt-0.5 truncate">{note}</p>}
                            <input
                              type="text"
                              value={note}
                              onChange={e => setItemNotes(prev => ({ ...prev, [currentTable]: { ...(prev[currentTable] || {}), [item.id]: e.target.value } }))}
                              placeholder={tt("+ Ghi chú...", "+ Notiz...")}
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
                               <button className="w-7 h-7 bg-stone-50 text-stone-400 rounded-[0.7rem] flex items-center justify-center hover:bg-orange-50 hover:text-primary transition-all border border-stone-100 shadow-sm" title={tt("Ghi chú", "Notiz")}>
                                  <span className="material-symbols-outlined text-[14px]">edit</span>
                               </button>
                               <button onClick={() => removeItem(item.id)} className="w-7 h-7 bg-red-50 text-red-500 rounded-[0.7rem] flex items-center justify-center hover:bg-red-500 hover:text-white transition-all border border-red-100 shadow-sm" title={tt("Xóa món", "Gericht löschen")}>
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
                    <span>{tt("Tạm tính", "Zwischenrechnung")}</span>
                     <span className="text-stone-600">{formatMoney(total)}</span>
                   </div>
                   <div className="flex justify-between items-end pt-2">
                    <span className="font-bold text-sm text-stone-900">{tt("Tổng cộng", "Gesamt")}</span>
                     <span className="font-headline font-black text-2xl lg:text-3xl text-primary tracking-tight">{formatMoney(total)}</span>
                   </div>
                 </div>

                 {/* Action Buttons */}
                 <div className="space-y-3 shrink-0">
                   <div className="grid grid-cols-2 gap-3">
                     <button
                       onClick={() => printOrderTicket('ALL')}
                       disabled={currentItems.length === 0}
                       className="py-3.5 bg-stone-50 text-stone-600 font-bold rounded-2xl hover:bg-stone-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-xs shadow-sm border border-stone-200/50"
                     >
                      <span className="material-symbols-outlined text-[16px]">restaurant</span> {currentItems.length > 0 && currentItems.some(i => i.qty > (kitchenSent[currentTable]?.[i.id] || 0)) ? <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error animate-pulse"></span> : null} {tt("Gửi Bếp / Bar", "Küche / Bar")}
                     </button>
                     <button
                       onClick={() => printTamTinh()}
                       disabled={!isAdmin || currentItems.length === 0}
                       className="py-3.5 bg-stone-50 text-stone-600 font-bold rounded-2xl hover:bg-stone-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-xs shadow-sm border border-stone-200/50"
                     >
                      <span className="material-symbols-outlined text-[16px]">receipt</span> {tt("Tạm Tính", "Zwischenrechnung")}
                     </button>
                   </div>
                   
                   {tableStatus[currentTable] === "PAYING" ? (
                     <button
                       onClick={resetTable}
                       className="w-full py-4 bg-error-container text-error hover:bg-red-200 font-bold text-sm rounded-[1.2rem] shadow-sm transition-all uppercase tracking-wider flex items-center justify-center gap-2"
                     >
                       <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                      {tt("RESET BÀN TRỐNG", "TISCH ZURÜCKSETZEN")}
                     </button>
                   ) : (
                     <button
                       onClick={() => { if (!isAdmin) return; handlePayment(); }}
                       disabled={!isAdmin || currentItems.length === 0}
                       className="w-full py-4 bg-primary hover:bg-[#c2410c] text-white font-bold text-sm rounded-[1.2rem] shadow-lg shadow-orange-300/40 active:scale-95 transition-all uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-70 disabled:grayscale-[0.5]"
                     >
                       <span className="material-symbols-outlined text-[18px]">payments</span>
                      {tt("THANH TOÁN & IN BILL", "BEZAHLEN & RECHNUNG")}
                     </button>
                   )}
                 </div>
              </aside>
            </div>
          )
        )}

        {/* ===== MANAGE VIEW ===== */}
        {sidebarView === "manage" && (
          <div className="flex flex-col h-full w-full max-w-7xl mx-auto">
            
            {/* Header Section with Tabs */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 shrink-0">
              <div>
                <h2 className="text-4xl font-black text-on-surface font-headline mb-2">{tt("Hệ thống Quản lý", "Verwaltungssystem")}</h2>
                <p className="text-on-surface-variant font-medium">{tt("Điều chỉnh thực đơn và sơ đồ bàn nướng theo thời gian thực.", "Menü und Tischplan in Echtzeit verwalten.")}</p>
              </div>
              <div className="flex bg-surface-container-high p-1.5 rounded-2xl">
                <button type="button" disabled={menuSaving || tableSaving} onClick={() => { if (menuSaving || tableSaving) return; setManageTab("edit"); setEditItem(null); }} className={`px-6 py-2.5 font-bold rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none ${manageTab !== "table" ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}>
                  {tt("Món ăn & Đồ uống", "Essen & Getränke")}
                </button>
                <button type="button" disabled={menuSaving || tableSaving} onClick={() => { if (menuSaving || tableSaving) return; setManageTab("table"); setEditingTable(null); }} className={`px-6 py-2.5 font-bold rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none ${manageTab === "table" ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}>
                  {tt("Quản lý Bàn", "Tischverwaltung")}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pb-8 pr-2">
            {manageTab !== "table" && (
              <div className="flex flex-col gap-6 relative min-h-[120px]">
                {menuSaving && !(manageTab === "add" || editItem) && (
                  <div className="absolute inset-0 z-20 rounded-[2rem] bg-surface-container-lowest/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                    <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
                    <span className="font-bold text-on-surface text-lg">{tt("Đang lưu...", "Wird gespeichert...")}</span>
                  </div>
                )}
                {/* Bento Grid - Menu Items Section */}
                <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {/* Add New Item Card */}
                  <div
                    onClick={() => {
                      if (menuSaving) return;
                      setManageTab("add");
                      setEditItem(null);
                      setMenuManagePriceEuro("");
                      setNewItem((prev) => ({ ...prev, kitchen_category: defaultKitchenCategoryId }));
                    }}
                    className={`group relative flex flex-col items-center justify-center p-8 bg-white/50 border-2 border-dashed border-outline-variant rounded-[2rem] hover:border-primary-container hover:bg-orange-50 transition-all min-h-[280px] ${menuSaving ? "opacity-50 pointer-events-none cursor-default" : "cursor-pointer"}`}
                  >
                    <div className="w-16 h-16 rounded-full bg-primary text-white shadow-md shadow-orange-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-orange-200/50">
                      <span className="material-symbols-outlined text-3xl">add</span>
                    </div>
                    <span className="text-lg font-bold text-on-surface">{tt("Thêm món mới", "Neues Gericht")}</span>
                    <p className="text-sm text-on-surface-variant mt-1 text-center">{tt("Cập nhật thực đơn", "Menü aktualisieren")}</p>
                  </div>

                  {/* Menu Item Cards */}
                  {menu.map(m => (
                    <div key={m.id} onClick={() => { if (menuSaving) return; setManageTab("edit"); setEditItem({...m}); setEditFile(null); setMenuManagePriceEuro(centsToEuroInputString(m.price)); }} className={`group relative overflow-hidden rounded-[2rem] bg-surface-container-lowest border ${editItem?.id === m.id ? 'border-primary ring-2 ring-primary/20' : 'border-outline-variant/50'} shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300 flex flex-col min-h-[280px] ${menuSaving ? "opacity-50 pointer-events-none cursor-default" : "cursor-pointer"}`}>
                      <div className="h-40 w-full overflow-hidden bg-surface-container-high relative">
                        {m.image ? (
                           <img src={menuImageSrc(m.image)} alt={m.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                           <div className="w-full h-full flex items-center justify-center text-on-surface-variant"><span className="material-symbols-outlined text-4xl opacity-50">restaurant</span></div>
                        )}
                        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-orange-700 shadow-sm text-right max-w-[70%]">
                           {m.type === "FOOD" ? tt("Món ăn", "Essen") : m.type === "DRINK" ? tt("Đồ uống", "Getränk") : "Combo"}
                           {m.type !== "DRINK" && (
                             <span className="block text-[10px] font-semibold text-stone-600 mt-0.5">
                               {kitchenCategoryDisplayLabel(settings, effectiveKitchenCategory(m, settings), language)}
                             </span>
                           )}
                        </div>
                      </div>
                      <div className="p-5 flex-1 flex flex-col">
                        <h3 className="text-lg font-bold text-on-surface mb-1 group-hover:text-primary transition-colors">{m.name}</h3>
                        <div className="mt-auto flex items-center justify-between pt-4">
                           <span className="text-xl font-black text-primary">{formatMoney(m.price)}</span>
                           <button type="button" disabled={menuSaving} onClick={(e) => { e.stopPropagation(); if (menuSaving) return; deleteMenu(m.id); }} className="w-10 h-10 rounded-full bg-error-container text-error flex items-center justify-center hover:scale-110 transition-transform shadow-sm disabled:opacity-40 disabled:pointer-events-none">
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
                       {menuSaving && (
                         <div className="absolute inset-0 z-20 rounded-[2.5rem] bg-surface-container-lowest/85 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-8">
                           <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
                           <span className="font-bold text-on-surface text-lg text-center">{tt("Đang lưu...", "Wird gespeichert...")}</span>
                           <span className="text-sm text-on-surface-variant text-center">{tt("Vui lòng đợi trong giây lát.", "Bitte kurz warten.")}</span>
                         </div>
                       )}
                       {/* Close Button */}
                       <button type="button" disabled={menuSaving} onClick={() => { if (menuSaving) return; setManageTab("edit"); setEditItem(null); setFile(null); setEditFile(null); }} className="absolute top-6 right-6 w-12 h-12 bg-surface-container-high hover:bg-outline-variant/30 text-on-surface flex items-center justify-center rounded-full transition-colors shadow-sm disabled:opacity-40 disabled:pointer-events-none">
                         <span className="material-symbols-outlined text-2xl">close</span>
                       </button>

                       <h3 className="text-3xl font-black font-headline mb-8 text-on-surface pr-14 leading-tight">
                          {manageTab === "add" ? tt("Thêm món mới", "Neues Gericht") : `${tt("Chỉnh sửa", "Bearbeiten")}: ${editItem.name}`}
                       </h3>
                      
                       <div className="space-y-6">
                          <div>
                            <label className="block text-sm font-bold text-on-surface-variant mb-2 uppercase tracking-wider">{tt("Tên món", "Gerichtname")}</label>
                             <input type="text" value={manageTab === "add" ? newItem.name : editItem.name} 
                                onChange={e => manageTab === "add" ? setNewItem({...newItem, name: e.target.value}) : setEditItem({...editItem, name: e.target.value})}
                                className="w-full px-5 py-4 rounded-2xl bg-surface-container text-on-surface font-semibold border-2 border-transparent focus:border-primary focus:bg-white focus:shadow-sm outline-none transition-all placeholder:text-on-surface-variant/50 text-lg" 
                               placeholder={tt("VD: Gà nướng muối ớt", "z.B. Gegrilltes Huhn mit Salz und Chili")} />
                          </div>
                             <div className="grid grid-cols-2 gap-6">
                              <div>
                                 <label className="block text-sm font-bold text-on-surface-variant mb-2 uppercase tracking-wider">{tt("Giá (€)", "Preis (€)")}</label>
                                 <input
                                    type="text"
                                    inputMode="decimal"
                                    value={menuManagePriceEuro}
                                    onChange={(e) => setMenuManagePriceEuro(e.target.value)}
                                    placeholder={tt("VD: 26,90 hoặc 26.90", "z.B. 26,90 oder 26.90")}
                                    className="w-full px-5 py-4 rounded-2xl bg-surface-container text-on-surface font-semibold border-2 border-transparent focus:border-primary focus:bg-white focus:shadow-sm outline-none transition-all text-lg"
                                  />
                                 <p className="text-xs text-on-surface-variant mt-1.5">{tt("Nhập đúng số euro (dấu phẩy hoặc chấm đều được).", "Betrag in Euro (Komma oder Punkt).")}</p>
                              </div>
                              <div>
                                 <label className="block text-sm font-bold text-on-surface-variant mb-2 uppercase tracking-wider">{tt("Loại", "Typ")}</label>
                                 <select value={manageTab === "add" ? newItem.type : editItem.type} 
                                    onChange={e => {
                                      const v = e.target.value;
                                      const ids = new Set(kitchenCategoriesList.map((c) => c.id));
                                      const validCat = (c) =>
                                        c && ids.has(c) ? c : defaultKitchenCategoryId;
                                      if (manageTab === "add") {
                                        setNewItem({
                                          ...newItem,
                                          type: v,
                                          kitchen_category:
                                            v === "DRINK" ? newItem.kitchen_category : validCat(newItem.kitchen_category),
                                        });
                                      } else {
                                        setEditItem({
                                          ...editItem,
                                          type: v,
                                          kitchen_category:
                                            v === "DRINK" ? editItem.kitchen_category : validCat(editItem.kitchen_category),
                                        });
                                      }
                                    }}
                                    className="w-full px-5 py-4 rounded-2xl bg-surface-container text-on-surface font-semibold border-2 border-transparent focus:border-primary focus:bg-white focus:shadow-sm outline-none transition-all cursor-pointer text-lg appearance-none">
                                   <option value="FOOD">{tt("Đồ ăn", "Essen")}</option>
                                    <option value="DRINK">{tt("Đồ uống", "Getränk")}</option>
                                    <option value="COMBO">Combo</option>
                                 </select>
                              </div>
                          </div>
                          {(manageTab === "add" ? newItem.type : editItem.type) !== "DRINK" && (
                            <div>
                              <label className="block text-sm font-bold text-on-surface-variant mb-2 uppercase tracking-wider">
                                {tt("Nhóm in bếp", "Küchen-Gruppe")}
                              </label>
                              <select
                                value={effectiveKitchenCategory(
                                  manageTab === "add" ? newItem : editItem,
                                  settings
                                )}
                                onChange={(e) =>
                                  manageTab === "add"
                                    ? setNewItem({ ...newItem, kitchen_category: e.target.value })
                                    : setEditItem({ ...editItem, kitchen_category: e.target.value })
                                }
                                className="w-full px-5 py-4 rounded-2xl bg-surface-container text-on-surface font-semibold border-2 border-transparent focus:border-primary focus:bg-white focus:shadow-sm outline-none transition-all cursor-pointer text-lg appearance-none"
                              >
                                {kitchenCategoriesList.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {language === "de" ? o.labelDe || o.labelVi : o.labelVi}
                                  </option>
                                ))}
                              </select>
                              <p className="text-xs text-on-surface-variant mt-2">
                                {tt(
                                  "Thứ tự & tên nhóm chỉnh trong Cấu hình Hệ thống → Danh mục bếp. Đồ uống in phiếu pha chế riêng.",
                                  "Reihenfolge unter Systemeinstellungen → Küchen-Kategorien. Getränke separat."
                                )}
                              </p>
                            </div>
                          )}
                          <div>
                             <label className="block text-sm font-bold text-on-surface-variant mb-2 uppercase tracking-wider">{tt("Ảnh đại diện", "Titelbild")}</label>
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
                             <button
                               type="button"
                               disabled={menuSaving}
                               onClick={() => {
                                 if (menuSaving) return;
                                 const cents = parseEuroInputToCents(menuManagePriceEuro);
                                 if (cents === null) {
                                   alert(tt("Nhập giá hợp lệ (ví dụ 26,90).", "Bitte gültigen Preis eingeben (z.B. 26,90)."));
                                   return;
                                 }
                                 if (manageTab === "add") addMenu(cents);
                                 else updateMenu(cents);
                               }}
                               className="flex-1 bg-gradient-to-br from-primary to-orange-600 hover:scale-[1.02] text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 shadow-xl shadow-orange-300/40 active:scale-95 transition-all disabled:opacity-70 disabled:pointer-events-none disabled:hover:scale-100"
                             >
                                <span className={`material-symbols-outlined text-2xl ${menuSaving ? "animate-spin" : ""}`}>{menuSaving ? "progress_activity" : manageTab === "add" ? "add_circle" : "save_as"}</span>
                                <span>{menuSaving ? tt("Đang lưu...", "Wird gespeichert...") : manageTab === "add" ? tt("Tạo món mới", "Gericht anlegen") : tt("Lưu thay đổi", "Änderungen speichern")}</span>
                             </button>
                             <button type="button" disabled={menuSaving} onClick={() => { if (menuSaving) return; setManageTab("edit"); setEditItem(null); setFile(null); setEditFile(null); }} className="px-8 bg-surface-container-highest hover:bg-outline-variant/50 text-on-surface-variant hover:text-on-surface py-4 rounded-2xl font-black text-lg transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none">
                                {tt("Hủy Bỏ", "Abbrechen")}
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
              <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full relative min-h-[160px]">
                {tableSaving && (
                  <div className="absolute inset-0 z-20 rounded-[2rem] bg-surface-container-lowest/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                    <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
                    <span className="font-bold text-on-surface text-lg">{tt("Đang lưu...", "Wird gespeichert...")}</span>
                  </div>
                )}
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
                         {tt("Thêm bàn nhanh", "Schnell Tisch hinzufügen")}
                      </h3>
                      <div className="flex flex-col gap-4">
                         <div className="relative">
                           <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 select-none font-bold">{tt("BÀN", "TISCH")}</span>
                           <input type="number" min="1" placeholder={tt("Số (VD: 21)", "Nummer (z.B. 21)")} value={newTableNum} onChange={e => setNewTableNum(e.target.value)} onKeyDown={e => e.key === "Enter" && !tableSaving && addTable()} disabled={tableSaving}
                               className="w-full pl-14 pr-4 py-4 rounded-xl bg-surface-container text-on-surface border border-outline-variant/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold text-lg transition-all disabled:opacity-60" />
                         </div>
                         <button type="button" disabled={tableSaving} onClick={() => { if (!tableSaving) addTable(); }} className="w-full py-4 bg-primary hover:bg-orange-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-orange-200/50 active:scale-95 transition-all disabled:opacity-60 disabled:pointer-events-none">
                           <span className={`material-symbols-outlined ${tableSaving ? "animate-spin" : ""}`}>{tableSaving ? "progress_activity" : "add"}</span> {tableSaving ? tt("Đang lưu...", "Wird gespeichert...") : tt("Thêm bàn mới", "Neuen Tisch hinzufügen")}
                         </button>
                      </div>
                   </div>

                   <div className="bg-surface-container-lowest rounded-[2rem] p-8 border border-outline-variant/30 shadow-sm flex flex-col items-center justify-center text-center">
                       <span className="material-symbols-outlined text-6xl text-primary/30 mb-4">analytics</span>
                       <h4 className="text-lg font-bold">{tt("Tổng số", "Gesamt")}: {tableList.length} {tt("bàn", "Tische")}</h4>
                       <p className="text-on-surface-variant mt-2 text-sm">{tt("Quản lý không gian phục vụ và tạo thêm bàn mới khi cần.", "Verwalten Sie den Servicebereich und fügen Sie bei Bedarf neue Tische hinzu.")}</p>
                   </div>
                </div>

                <div className="bg-surface-container-lowest rounded-[2rem] p-8 border border-outline-variant/30 shadow-sm mt-2">
                   <h3 className="text-xl font-bold font-headline mb-6 flex items-center justify-between text-on-surface">
                      <div className="flex items-center gap-2">
                         <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"><span className="material-symbols-outlined">format_list_numbered</span></div>
                         {tt("Danh sách bàn", "Tischliste")}
                      </div>
                   </h3>

                   {tableList.length === 0 ? (
                      <div className="text-center py-12 text-on-surface-variant flex flex-col items-center">
                         <span className="material-symbols-outlined text-6xl mb-4 opacity-20">table_restaurant</span>
                         <p>{tt("Chưa có bàn nào trong hệ thống.", "Es gibt noch keine Tische im System.")}</p>
                      </div>
                   ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                         {tableList.map(t => (
                            <div key={t.table_num} className="bg-surface-container rounded-2xl p-5 border border-outline-variant/30 hover:border-primary/50 transition-colors group relative overflow-hidden">
                               {editingTable?.table_num === t.table_num ? (
                                  <div className="flex flex-col gap-3">
                                     <div className="text-xs font-semibold text-primary uppercase">{tt("Đổi bàn số", "Tischnummer ändern")} {t.table_num}</div>
                                     <input type="number" min="1" value={editingTable.new_num} onChange={e => setEditingTable({ ...editingTable, new_num: e.target.value })} onKeyDown={e => { if (e.key === "Enter") renameTable(); if (e.key === "Escape") setEditingTable(null); }} autoFocus
                                        className="w-full text-lg font-bold px-3 py-2 rounded-xl border-2 border-primary focus:outline-none bg-white text-on-surface" />
                                     <div className="flex gap-2">
                                       <button type="button" disabled={tableSaving} onClick={() => { if (!tableSaving) renameTable(); }} className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-bold active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-1">
                                         {tableSaving ? <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span> : null}
                                         {tableSaving ? tt("Đang lưu...", "Speichern...") : tt("Lưu", "Speichern")}
                                       </button>
                                       <button type="button" disabled={tableSaving} onClick={() => { if (!tableSaving) setEditingTable(null); }} className="flex-1 py-2 bg-surface-container-highest text-on-surface-variant hover:text-on-surface rounded-lg text-sm font-bold active:scale-95 transition-transform disabled:opacity-50">{tt("Huỷ", "Abbrechen")}</button>
                                     </div>
                                  </div>
                               ) : (
                                  <div className="flex flex-col h-full">
                                     <div className="flex justify-between items-start mb-4">
                                        <div className="font-headline font-black text-2xl text-on-surface">{tt("Bàn", "Tisch")} {t.table_num}</div>
                                        <div className="flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                           <button type="button" disabled={tableSaving} onClick={() => { if (!tableSaving) setEditingTable({ table_num: t.table_num, new_num: String(t.table_num) }); }} className="w-8 h-8 rounded-full bg-surface-container-highest text-on-surface hover:bg-primary hover:text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:pointer-events-none">
                                              <span className="material-symbols-outlined text-[16px]">edit</span>
                                           </button>
                                           <button type="button" onClick={() => { if (!tableSaving) deleteTable(t.table_num); }} disabled={t.status === "OPEN" || tableSaving} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${t.status === "OPEN" || tableSaving ? "bg-surface-container-highest text-outline-variant cursor-not-allowed" : "bg-surface-container-highest text-error hover:bg-error hover:text-white"}`}>
                                              <span className="material-symbols-outlined text-[16px]">delete</span>
                                           </button>
                                        </div>
                                     </div>
                                     <div className={`mt-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold w-fit ${t.status === "OPEN" ? "bg-orange-100 text-orange-700" : "bg-white/60 text-slate-500 border border-outline-variant/50"}`}>
                                        <div className={`w-2 h-2 rounded-full ${t.status === "OPEN" ? "bg-orange-500" : "bg-slate-300"}`}></div>
                                       {t.status === "OPEN" ? tt("Đang phục vụ", "In Bedienung") : tt("Trống", "Frei")}
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
            fetchBills={fetchBills}
            setSelectedBill={setSelectedBill}
            bills={bills}
            selectedBill={selectedBill}
            fetchBillDetail={fetchBillDetail}
            formatMoney={formatMoney}
            callPrintApi={callPrintApi}
            onReprintBill={handleReprintBill}
            onDownloadBillPdf={handleDownloadBillPdf}
            language={language}
          />
        )}

        {/* ===== SETTINGS VIEW ===== */}
        {sidebarView === "settings" && (
          <div className="p-4 md:p-8 space-y-8 overflow-y-auto w-full max-w-7xl mx-auto h-full flex flex-col">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0">
              <div>
                <h3 className="text-3xl font-extrabold text-on-surface tracking-tight font-headline">{tt("Cấu hình Hệ thống", "Systemeinstellungen")}</h3>
                <p className="text-on-surface-variant mt-1 font-medium">{tt("Máy in, số bàn, danh mục bếp, mẫu in bill. Thông tin cửa hàng trên bill: tab Report Bill.", "Drucker, Tische, Küchen-Kategorien, Belegvorlagen. Shopdaten auf dem Beleg: Report Bill.")}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <div className="flex rounded-xl p-1 bg-surface-container-high border border-outline-variant/30">
                  <button
                    type="button"
                    disabled={settingsSaving}
                    onClick={() => { if (!settingsSaving) setSettingsPanel("general"); }}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50 ${settingsPanel === "general" ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:bg-surface-container"}`}
                  >
                    {tt("Chung & máy in", "Allgemein & Drucker")}
                  </button>
                  <button
                    type="button"
                    disabled={settingsSaving}
                    onClick={() => { if (!settingsSaving) setSettingsPanel("kitchenCats"); }}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50 ${settingsPanel === "kitchenCats" ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:bg-surface-container"}`}
                  >
                    {tt("Danh mục bếp", "Küchen-Kategorien")}
                  </button>
                  <button
                    type="button"
                    disabled={settingsSaving}
                    onClick={() => { if (!settingsSaving) setSettingsPanel("reportBill"); }}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50 ${settingsPanel === "reportBill" ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:bg-surface-container"}`}
                  >
                    Report Bill
                  </button>
                </div>
                 <button type="button" disabled={settingsSaving} onClick={() => { if (!settingsSaving) saveAllSettings(); }} className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all shadow-sm disabled:opacity-60 disabled:pointer-events-none ${settingsSaved ? "bg-green-500 text-white" : "bg-primary text-white shadow-primary/20 hover:opacity-90 active:scale-95"}`}>
                    <span className={`material-symbols-outlined text-[20px] ${settingsSaving ? "animate-spin" : ""}`}>{settingsSaving ? "progress_activity" : settingsSaved ? "check_circle" : "save"}</span>
                    {settingsSaving ? tt("Đang lưu...", "Wird gespeichert...") : settingsSaved ? tt("Đã lưu cài đặt", "Einstellungen gespeichert") : tt("Lưu thay đổi", "Änderungen speichern")}
                 </button>
              </div>
            </div>

            {settingsPanel === "reportBill" ? (
              <ReportBillSettingsSection
                settings={settings}
                setSettings={setSettings}
                saveAllSettings={saveAllSettings}
                settingsSaved={settingsSaved}
                settingsSaving={settingsSaving}
                tt={tt}
                toggleLanguage={toggleLanguage}
                language={language}
                dbPrinters={dbPrinters}
              />
            ) : null}

            {settingsPanel === "kitchenCats" ? (
              <KitchenCategoriesSettingsSection
                settings={settings}
                setSettings={setSettings}
                mergeAndSaveSettings={mergeAndSaveSettings}
                settingsSaved={settingsSaved}
                settingsSaving={settingsSaving}
                tt={tt}
              />
            ) : null}

            {/* Grid Content */}
            {settingsPanel === "general" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-8">
              {/* Left Column: Store Info & Security */}
              <div className="lg:col-span-4 space-y-6 flex flex-col">
                <section className="bg-surface-container-lowest p-6 rounded-[2rem] space-y-4 border border-outline-variant/30 shadow-sm shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-secondary-container/20 text-secondary rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined">table_restaurant</span>
                    </div>
                    <h4 className="font-bold text-lg font-headline text-on-surface">{tt("Số bàn tối đa", "Maximale Tische")}</h4>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    {tt(
                      "Tên cửa hàng, địa chỉ, hotline: chỉnh trong tab Report Bill → Thông tin cửa hàng (chung).",
                      "Shopname, Adresse, Hotline: unter Report Bill → gemeinsame Shop-Daten."
                    )}
                  </p>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px]">numbers</span>
                    <input
                      className="w-full bg-surface-container border-none rounded-xl pl-11 pr-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium text-on-surface outline-none"
                      type="number"
                      min="1"
                      max="100"
                      value={settings.total_tables || "20"}
                      onChange={(e) => setSettings((s) => ({ ...s, total_tables: e.target.value }))}
                    />
                  </div>
                </section>

                <section className="bg-surface-container-lowest p-6 rounded-[2rem] space-y-6 border border-outline-variant/30 shadow-sm shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined">badge</span>
                    </div>
                    <h4 className="font-bold text-lg font-headline text-on-surface">{tt("Nhân viên thu ngân", "Kassenpersonal")}</h4>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{tt("Tên hiển thị trên bill", "Anzeigename auf Rechnung")}</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px]">person</span>
                      <input
                        className="w-full bg-surface-container border-none rounded-xl pl-11 pr-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium text-on-surface outline-none"
                        type="text"
                        value={settings.cashier_name || ""}
                        onChange={(e) => setSettings((s) => ({ ...s, cashier_name: e.target.value }))}
                        placeholder={tt("VD: Thu ngân A", "z.B. Kasse A")}
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
                        <h4 className="font-bold text-xl font-headline text-on-surface">{tt("Quản lý máy in", "Druckerverwaltung")}</h4>
                        <p className="text-sm text-on-surface-variant font-medium mt-0.5">{dbPrinters.length} {tt("máy in đã cấu hình", "konfigurierte Drucker")}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        fetchDbPrinters();
                        fetchWindowsPrinters();
                      }}
                      className="flex items-center gap-2 bg-surface-container-high hover:bg-surface-container-highest transition-colors px-4 py-2 rounded-xl text-sm font-bold text-on-surface-variant"
                    >
                      <span className="material-symbols-outlined text-[18px]">sync</span>
                      {tt("Làm mới", "Aktualisieren")}
                    </button>
                  </div>

                  {!isLocalQuayOrigin() && !isPosElectron() && (
                    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                      <p className="font-bold mb-1">{tt("Thêm máy in trên cloud", "Drucker in der Cloud anlegen")}</p>
                      <p className="text-amber-900/90 leading-relaxed">
                        {tt(
                          "Nhập đúng tên máy in như trong Windows trên máy quầy (vd: EPSON TM-T82). Print Bridge sẽ in tới đúng tên đó.",
                          "Geben Sie den exakten Windows-Druckernamen am Kassen-PC ein (z.B. EPSON TM-T82)."
                        )}
                      </p>
                      <p className="mt-2 text-amber-900/90 leading-relaxed">
                        {tt("Chạy ", "Starten Sie ")}<strong>POS_PrintBridge.exe</strong>
                        {tt(" với ", " mit ")}
                        <code className="rounded bg-amber-100/80 px-1">wss://&lt;backend&gt;/bridge?secret=...</code>
                        {tt(" và ", " und ")}
                        <code className="rounded bg-amber-100/80 px-1">api_url</code>
                        {tt(" (không có / cuối) để nhận job in.", " (ohne Slash am Ende) für Druckaufträge.")}
                      </p>
                    </div>
                  )}

                  {(isLocalQuayOrigin() || isPosElectron()) && windowsPrinters.length > 0 && (
                    <p className="mb-4 text-xs text-on-surface-variant">
                      {tt("Gợi ý từ máy quầy:", "Vorschläge vom Kassen-PC:")}{" "}
                      {windowsPrinters.map((p) => p.name).filter(Boolean).join(", ")}
                    </p>
                  )}

                  {/* Form thêm máy in */}
                  <div className="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/30 mb-8 shrink-0">
                    <h5 className="font-bold text-base text-on-surface mb-4">{tt("Thêm máy in mới", "Neuen Drucker hinzufügen")}</h5>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                      <div className="md:col-span-5 space-y-1.5">
                        <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{tt("Tên máy in", "Druckername")}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px]">print</span>
                          <input
                            type="text"
                            value={newPrinter.name}
                            onChange={(e) => setNewPrinter((s) => ({ ...s, name: e.target.value }))}
                            placeholder={tt("VD: EPSON TM-T88VI", "z.B. EPSON TM-T88VI")}
                            list="pos-windows-printer-hints"
                            className="w-full bg-white border border-outline-variant/50 rounded-xl pl-10 pr-4 py-2.5 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                          />
                          <datalist id="pos-windows-printer-hints">
                            {windowsPrinters.map((p, i) => (
                              <option key={i} value={p.name} />
                            ))}
                          </datalist>
                        </div>
                      </div>
                      <div className="md:col-span-4 space-y-1.5">
                        <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{tt("Loại phiếu", "Belegtyp")}</label>
                        <select
                          value={newPrinter.type}
                          onChange={(e) => setNewPrinter((s) => ({ ...s, type: e.target.value }))}
                          className="w-full bg-white border border-outline-variant/50 rounded-xl px-4 py-2.5 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm appearance-none"
                        >
                          <option value="KITCHEN">{tt("Bếp (KITCHEN)", "Küche (KITCHEN)")}</option>
                          <option value="BAR">{tt("Bar / Pha chế (BAR)", "Bar (BAR)")}</option>
                          <option value="BILL">{tt("Hóa đơn (BILL)", "Rechnung (BILL)")}</option>
                          <option value="TAMTINH">{tt("Tạm tính (TAMTINH)", "Zwischenrechnung (TAMTINH)")}</option>
                          <option value="ALL">{tt("Tất cả loại phiếu (ALL)", "Alle Belege (ALL)")}</option>
                        </select>
                      </div>
                      <div className="md:col-span-3 space-y-1.5">
                        <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{tt("Khổ giấy (mm)", "Papierbreite (mm)")}</label>
                        <input
                          type="number"
                          min={40}
                          max={120}
                          value={newPrinter.paper_size}
                          onChange={(e) =>
                            setNewPrinter((s) => ({ ...s, paper_size: Number(e.target.value) || 80 }))
                          }
                          className="w-full bg-white border border-outline-variant/50 rounded-xl px-4 py-2.5 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-bold text-on-surface text-sm"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addDbPrinter}
                      disabled={!String(newPrinter.name || "").trim()}
                      className={`mt-4 w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                        String(newPrinter.name || "").trim()
                          ? "bg-primary text-white hover:bg-orange-600 active:scale-[0.99] shadow-md shadow-primary/20"
                          : "bg-surface-container-highest text-outline-variant cursor-not-allowed"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[22px]">add</span>
                      {tt("Thêm máy in mới", "Neuen Drucker hinzufügen")}
                    </button>
                  </div>

                  {/* Printer List Grid */}
                  <div className="flex-1 overflow-y-auto min-h-[300px]">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {loadingDbPrinters ? (
                         <div className="col-span-full py-12 text-center text-on-surface-variant flex flex-col items-center">
                            <span className="material-symbols-outlined animate-spin text-4xl mb-3 opacity-20">refresh</span>
                            <p className="font-medium">{tt("Đang tải cấu hình máy in...", "Druckerkonfiguration wird geladen...")}</p>
                         </div>
                      ) : dbPrinters.length === 0 ? (
                         <div className="col-span-full border-2 border-dashed border-outline-variant/50 rounded-2xl flex flex-col items-center justify-center p-12 gap-3 opacity-70">
                            <span className="material-symbols-outlined text-5xl text-outline">print_disabled</span>
                            <p className="text-sm font-bold text-on-surface-variant">{tt("Chưa có máy in", "Noch keine Drucker")}</p>
                         </div>
                      ) : dbPrinters.map(p => (
                         <div key={p.id} className={`p-5 rounded-2xl border transition-all group ${p.is_enabled ? 'bg-surface-container border-outline-variant/30 hover:border-primary/40 shadow-sm' : 'bg-surface-container-low border-dashed border-outline-variant/40 opacity-70'}`}>
                            <div className="flex justify-between items-start mb-4">
                               <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform ${p.is_enabled ? (p.type==='KITCHEN'?'bg-orange-100 text-orange-600':p.type==='TAMTINH'?'bg-violet-100 text-violet-700':p.type==='DRINK'?'bg-blue-100 text-blue-600':'bg-primary-container text-primary') : 'bg-surface-container-highest text-outline'}`}>
                                     <span className="material-symbols-outlined text-[20px]">{p.type==='KITCHEN'?'oven_gen':p.type==='TAMTINH'?'calculate':p.type==='DRINK'?'local_bar':'receipt_long'}</span>
                                  </div>
                                  <div>
                                     <h5 className="font-bold text-on-surface text-sm max-w-[150px] truncate">{p.name}</h5>
                                     <span className={`text-[9px] py-0.5 px-2 rounded-full font-bold uppercase tracking-widest mt-1 inline-block ${p.is_enabled ? 'bg-green-100 text-green-700' : 'bg-surface-container-highest text-on-surface-variant'}`}>{p.is_enabled ? tt("Đang bật", "An") : tt("Đã tắt", "Aus")}</span>
                                  </div>
                               </div>
                               <div className="flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => updateDbPrinter(p, { is_enabled: p.is_enabled ? 0 : 1 })} title={p.is_enabled ? tt("Tắt máy in", "Drucker ausschalten") : tt("Bật máy in", "Drucker einschalten")}
                                     className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${p.is_enabled ? 'bg-surface-container-highest text-on-surface hover:text-orange-600' : 'bg-surface-container-highest text-on-surface hover:text-green-600'}`}>
                                     <span className="material-symbols-outlined text-[18px]">{p.is_enabled ? "power_settings_new" : "play_arrow"}</span>
                                  </button>
                                  <button onClick={() => deleteDbPrinter(p.id)} title={tt("Xóa cấu hình", "Konfiguration löschen")}
                                     className="w-8 h-8 rounded-full bg-surface-container-highest text-error hover:bg-error hover:text-white flex items-center justify-center transition-colors">
                                     <span className="material-symbols-outlined text-[18px]">delete</span>
                                  </button>
                               </div>
                            </div>
                            <div className="space-y-2 mt-4 bg-white/50 p-3 rounded-xl border border-outline-variant/20">
                               <div className="flex justify-between items-center text-xs">
                                  <span className="text-on-surface-variant font-medium">{tt("Vai trò", "Rolle")}:</span>
                                 <span className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${p.type==='KITCHEN'?'bg-orange-100 text-orange-700':p.type==='TAMTINH'?'bg-violet-100 text-violet-800':p.type==='DRINK'?'bg-blue-100 text-blue-700':'bg-primary-container text-on-primary-container'}`}>{p.type === "ALL" ? tt("Tất cả", "Alle") : p.type}</span>
                               </div>
                               <div className="flex justify-between items-center text-xs">
                                  <span className="text-on-surface-variant font-medium">{tt("Khổ giấy", "Papierbreite")}:</span>
                                  <span className="font-bold text-on-surface bg-surface-container-highest px-2 py-0.5 rounded text-[10px]">{p.paper_size}mm</span>
                               </div>
                            </div>
                         </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </div>
            )}
          </div>
        )}

        {/* ===== USERS VIEW ===== */}
        {sidebarView === "users" && isAdmin && (
          <div className="flex-1 overflow-y-auto w-full max-w-7xl mx-auto p-4 md:p-8">
            <h2 className="text-3xl font-black font-headline text-on-surface mb-8">{tt("Quản lý Nhân sự", "Mitarbeiterverwaltung")}</h2>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Form Thêm Nhân Viên */}
              <section className="bg-surface-container-lowest p-8 rounded-[2.5rem] border border-outline-variant/30 shadow-sm">
                <h3 className="font-headline font-black text-xl mb-6 text-on-surface flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><span className="material-symbols-outlined">person_add</span></div>
                  {tt("Thêm nhân viên", "Mitarbeiter hinzufügen")}
                </h3>
                <div className="space-y-5">
                  <div>
                    <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">{tt("Tên đăng nhập", "Benutzername")}</label>
                    <input className="w-full rounded-2xl border-none bg-surface-container px-4 py-3.5 font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={newUser.username} onChange={(e) => setNewUser((s) => ({ ...s, username: e.target.value }))} placeholder={tt("VD: nhanvien1", "z.B. mitarbeiter1")} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">{tt("Mật khẩu", "Passwort")}</label>
                    <input type="password" className="w-full rounded-2xl border-none bg-surface-container px-4 py-3.5 font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={newUser.password} onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))} placeholder="••••••••" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">{tt("Tên hiển thị", "Anzeigename")}</label>
                    <input className="w-full rounded-2xl border-none bg-surface-container px-4 py-3.5 font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all" value={newUser.full_name} onChange={(e) => setNewUser((s) => ({ ...s, full_name: e.target.value }))} placeholder={tt("VD: Nguyễn Văn A", "z.B. Max Mustermann")} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">{tt("Quyền hạn", "Rolle")}</label>
                    <select className="w-full rounded-2xl border-none bg-surface-container px-4 py-3.5 font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer appearance-none" value={newUser.role} onChange={(e) => setNewUser((s) => ({ ...s, role: e.target.value }))}>
                      <option value="staff">{tt("Nhân viên (Staff)", "Mitarbeiter (Staff)")}</option>
                      <option value="admin">{tt("Quản trị (Admin)", "Administrator (Admin)")}</option>
                    </select>
                  </div>
                  <button type="button" disabled={userSaving} onClick={() => { if (!userSaving) createUser(); }} className="w-full rounded-2xl bg-primary text-white py-4 font-black text-lg shadow-xl shadow-orange-300/40 active:scale-95 transition-all mt-4 flex items-center justify-center gap-2 disabled:opacity-60 disabled:pointer-events-none">
                    <span className={`material-symbols-outlined ${userSaving ? "animate-spin" : ""}`}>{userSaving ? "progress_activity" : "person_add"}</span>
                    {userSaving ? tt("Đang lưu...", "Wird gespeichert...") : tt("Tạo tài khoản", "Konto erstellen")}
                  </button>
                </div>
              </section>

              {/* Danh Sách Nhân Viên */}
              <section className="xl:col-span-2 bg-surface-container-lowest p-8 rounded-[2.5rem] border border-outline-variant/30 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-headline font-black text-xl text-on-surface flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center"><span className="material-symbols-outlined">group</span></div>
                    {tt("Danh sách nhân viên", "Mitarbeiterliste")}
                  </h3>
                  <button type="button" disabled={userSaving} onClick={() => { if (!userSaving) fetchUsers(); }} className="px-5 py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-50">
                    <span className="material-symbols-outlined text-[18px]">refresh</span> {tt("Làm mới", "Aktualisieren")}
                  </button>
                </div>
                {userLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant opacity-50">
                    <span className="material-symbols-outlined animate-spin text-4xl mb-4">refresh</span>
                    <p className="font-bold">{tt("Đang tải danh sách...", "Liste wird geladen...")}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {users.map((u) => (
                      <div key={u.id} className="p-5 rounded-3xl border border-outline-variant/20 bg-surface-container hover:border-primary/30 transition-all group overflow-hidden relative">
                        <div className="flex items-center gap-4 mb-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${u.role === 'admin' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                            {u.username[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-black text-on-surface truncate">{u.full_name || u.username}</div>
                            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{u.username} • {u.role === 'admin' ? tt("Quản trị", "Administrator") : tt("Nhân viên", "Mitarbeiter")}</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t border-outline-variant/10">
                          <button type="button" disabled={userSaving} onClick={() => { if (!userSaving) updateUser(u, { is_active: Number(u.is_active) ? 0 : 1 }); }} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50 ${Number(u.is_active) ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {Number(u.is_active) ? tt("Kích hoạt", "Aktiv") : tt("Đã khóa", "Gesperrt")}
                          </button>
                          <div className="flex gap-2">
                            <button type="button" disabled={userSaving} onClick={() => { if (userSaving) return; const pw = window.prompt(tt("Đặt mật khẩu mới cho", "Neues Passwort setzen für") + ` ${u.username}`); if (pw) updateUser(u, { password: pw }); }} className="w-8 h-8 rounded-full bg-white text-amber-600 flex items-center justify-center hover:bg-amber-600 hover:text-white transition-all shadow-sm border border-amber-100 disabled:opacity-40 disabled:pointer-events-none">
                              <span className="material-symbols-outlined text-[16px]">key</span>
                            </button>
                            <button type="button" disabled={userSaving} onClick={() => { if (!userSaving) deleteUser(u); }} className="w-8 h-8 rounded-full bg-white text-error flex items-center justify-center hover:bg-error hover:text-white transition-all shadow-sm border border-red-100 disabled:opacity-40 disabled:pointer-events-none">
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* ===== STATS VIEW ===== */}
        {sidebarView === "stats" && isAdmin && (
          <StatsView
            formatMoney={formatMoney}
            statsTab={statsTab}
            setStatsTab={setStatsTab}
            statsToday={statsToday}
            statsMonthlyData={statsMonthlyData}
            statsYearlyData={statsYearlyData}
            menu={menu}
            language={language}
          />
        )}

      </div>
      </div>
    </main>

    {/* ==================== MOBILE BOTTOM NAVIGATION ==================== */}
    {isMobile && (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-t border-stone-200 flex items-center justify-around px-2 py-1.5 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <button
          onClick={() => setSidebarView("tables")}
          className={`flex flex-col items-center justify-center px-4 py-2 transition-all duration-300 active:scale-90 rounded-2xl ${sidebarView === "tables" ? "bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-lg shadow-orange-500/20" : "text-stone-400 hover:text-orange-500"}`}
        >
          <span className="material-symbols-outlined mb-0.5" style={{ fontVariationSettings: sidebarView === "tables" ? "'FILL' 1" : "'FILL' 0" }}>grid_view</span>
          <span className="font-headline font-bold text-[10px] uppercase tracking-wider">{tr("mobileTables")}</span>
        </button>

        <button
          onClick={() => setSidebarView("order")}
          className={`flex flex-col items-center justify-center px-4 py-2 transition-all duration-300 active:scale-90 rounded-2xl ${sidebarView === "order" ? "bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-lg shadow-orange-500/20" : "text-stone-400 hover:text-orange-500"}`}
        >
          <span className="material-symbols-outlined mb-0.5" style={{ fontVariationSettings: sidebarView === "order" ? "'FILL' 1" : "'FILL' 0" }}>restaurant_menu</span>
          <span className="font-headline font-bold text-[10px] uppercase tracking-wider">{tr("mobileOrder")}</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => setSidebarView("history")}
            className={`flex flex-col items-center justify-center px-4 py-2 transition-all duration-300 active:scale-90 rounded-2xl ${sidebarView === "history" ? "bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-lg shadow-orange-500/20" : "text-stone-400 hover:text-orange-500"}`}
          >
            <span className="material-symbols-outlined mb-0.5" style={{ fontVariationSettings: sidebarView === "history" ? "'FILL' 1" : "'FILL' 0" }}>receipt_long</span>
            <span className="font-headline font-bold text-[10px] uppercase tracking-wider">{tr("mobileHistory")}</span>
          </button>
        )}

        <button
          onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
          className="md:hidden flex flex-col items-center justify-center text-stone-400 px-4 py-2 hover:text-orange-500 transition-all duration-300 active:scale-90"
        >
          <span className="material-symbols-outlined mb-0.5">menu</span>
          <span className="font-headline font-bold text-[10px] uppercase tracking-wider">{tr("mobileMenu")}</span>
        </button>
      </nav>
    )}

    {/* Mobile Sidebar (Menu Overlay) */}
    {isSidebarExpanded && isMobile && (
      <div className="md:hidden fixed inset-0 z-[60] bg-surface-container flex flex-col animate-in slide-in-from-bottom pb-safe">
        <div className="flex items-center justify-between p-6 shrink-0 border-b border-outline-variant/20">
          <h2 className="text-2xl font-black font-headline text-primary">{tr("extendedMenu")}</h2>
          <button onClick={() => setIsSidebarExpanded(false)} className="bg-surface-container-high rounded-full p-2 flex items-center justify-center active:scale-95 text-on-surface-variant">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => { setSidebarView("tables"); setIsSidebarExpanded(false); }} className={`p-4 rounded-3xl flex flex-col items-center justify-center gap-2 border ${sidebarView === "tables" ? "bg-primary-container/20 border-primary text-primary" : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant"}`}>
              <span className="material-symbols-outlined text-3xl">grid_view</span>
              <span className="font-bold">{tr("floorMap")}</span>
            </button>
            <button onClick={() => { setSidebarView("order"); setIsSidebarExpanded(false); }} className={`p-4 rounded-3xl flex flex-col items-center justify-center gap-2 border ${sidebarView === "order" ? "bg-primary-container/20 border-primary text-primary" : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant"}`}>
              <span className="material-symbols-outlined text-3xl">restaurant_menu</span>
              <span className="font-bold">{tr("mobileOrder")}</span>
            </button>
            {isAdmin && (
              <>
                <button onClick={() => { setSidebarView("manage"); setIsSidebarExpanded(false); }} className={`p-4 rounded-3xl flex flex-col items-center justify-center gap-2 border ${sidebarView === "manage" ? "bg-primary-container/20 border-primary text-primary" : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant"}`}>
                  <span className="material-symbols-outlined text-3xl">format_list_bulleted</span>
                  <span className="font-bold text-center">Quản lý Thực đơn</span>
                </button>
                <button onClick={() => { setSidebarView("history"); setIsSidebarExpanded(false); }} className={`p-4 rounded-3xl flex flex-col items-center justify-center gap-2 border ${sidebarView === "history" ? "bg-primary-container/20 border-primary text-primary" : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant"}`}>
                  <span className="material-symbols-outlined text-3xl">receipt_long</span>
                  <span className="font-bold text-center">{tr("billHistory")}</span>
                </button>
                <button onClick={() => { setSidebarView("stats"); setIsSidebarExpanded(false); }} className={`p-4 rounded-3xl flex flex-col items-center justify-center gap-2 border ${sidebarView === "stats" ? "bg-primary-container/20 border-primary text-primary" : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant"}`}>
                  <span className="material-symbols-outlined text-3xl">trending_up</span>
                  <span className="font-bold text-center">Thống kê</span>
                </button>
                <button onClick={() => { setSidebarView("users"); setIsSidebarExpanded(false); }} className={`p-4 rounded-3xl flex flex-col items-center justify-center gap-2 border ${sidebarView === "users" ? "bg-primary-container/20 border-primary text-primary" : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant"}`}>
                  <span className="material-symbols-outlined text-3xl">group</span>
                  <span className="font-bold text-center">Nhân sự</span>
                </button>
                <button onClick={() => { setSidebarView("settings"); setIsSidebarExpanded(false); }} className={`p-4 rounded-3xl flex flex-col items-center justify-center gap-2 border ${sidebarView === "settings" ? "bg-primary-container/20 border-primary text-primary" : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant"}`}>
                  <span className="material-symbols-outlined text-3xl">settings</span>
                  <span className="font-bold text-center">{tr("settingsShort")}</span>
                </button>
              </>
            )}
          </div>
          <div className="pt-6 border-t border-outline-variant/20 flex flex-col items-center gap-4">
            <button onClick={handleLogout} className="w-full py-4 bg-error-container text-on-error-container font-black rounded-2xl flex items-center justify-center gap-2">
              <span className="material-symbols-outlined">logout</span> {tr("logout")}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ==================== MOBILE CART DRAWER (OVERLAY) ==================== */}
    {isMobile && showMobileCart && (
      <div className="fixed inset-0 z-[60] flex flex-col bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-300">
        <div 
          className="absolute inset-0" 
          onClick={() => setShowMobileCart(false)}
        />
          <div className="mt-auto bg-white rounded-t-[2.5rem] flex flex-col h-[92vh] w-full relative shadow-2xl animate-in slide-in-from-bottom duration-500 ease-out overflow-hidden">
          {/* Drag Handle / Close Header */}
          <div className="flex items-center justify-between p-6 pb-2">
            <div className="w-12 h-1.5 bg-stone-200 rounded-full mx-auto absolute top-3 left-1/2 -translate-x-1/2" />
            <button 
              onClick={() => setShowMobileCart(false)}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-stone-100 text-stone-500 active:scale-90 transition-transform"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            <h3 className="font-headline font-black text-lg">Thông tin đơn hàng</h3>
            <div className="w-10" /> 
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            <aside className="flex-1 flex flex-col bg-white px-6 pb-0 min-h-0">
               <div className="flex items-center justify-between mb-4 pb-4 border-b border-stone-100 shrink-0 gap-2">
                 <div className="flex items-center gap-2 min-w-0">
                   <h2 className="font-headline font-black text-xl text-stone-900">{tt("Bàn", "Tisch")} {currentTable || "--"}</h2>
                   <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1 truncate">
                     {currentTable ? (
                        tableStatus[currentTable] === "OPEN" ? `ORDER #${new Date().getTime().toString().slice(-4)}` :
                        tableStatus[currentTable] === "PAYING" ? "CHỜ RESET" : "TRỐNG"
                     ) : tt("Chưa chọn bàn", "Kein Tisch gewählt")}
                   </span>
                 </div>
                 {tableStatus[currentTable] === "OPEN" && (
                   <div className="flex gap-1.5 shrink-0">
                     <button
                       type="button"
                       onClick={() => {
                         setTransferDest("");
                         setTransferModal(true);
                       }}
                       disabled={currentItems.length === 0}
                       className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 disabled:opacity-40 active:scale-95 border border-orange-200/50"
                       title={tt("Chuyển bàn", "Tisch wechseln")}
                     >
                       <span className="material-symbols-outlined text-[18px]">sync_alt</span>
                     </button>
                     <button
                       type="button"
                       onClick={() => {
                         setCustomLineName("");
                         setCustomLinePrice("");
                         setCustomLineType("FOOD");
                         setCustomLineKitchenCat(defaultKitchenCategoryId);
                         setCustomLineQty("1");
                         setCustomLineModal(true);
                       }}
                       disabled={!currentTable}
                       className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center text-violet-700 disabled:opacity-40 active:scale-95 border border-violet-200/60"
                       title={tt("Món ngoài menu", "Außerhalb Speisekarte")}
                     >
                       <span className="material-symbols-outlined text-[18px]">post_add</span>
                     </button>
                     <button
                       type="button"
                       onClick={() => { setSplitSelected([]); setSplitTarget(""); setSplitModal(true); }}
                       disabled={currentItems.length === 0}
                       className="w-9 h-9 bg-stone-100 rounded-xl flex items-center justify-center text-stone-600 disabled:opacity-40 active:scale-95 border border-stone-200"
                       title={tt("Tách bàn", "Tisch aufteilen")}
                     >
                       <span className="material-symbols-outlined text-[18px]">call_split</span>
                     </button>
                   </div>
                 )}
               </div>

                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar mb-4 pr-1 relative">
                  {currentItems.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center flex-col text-stone-400">
                      <span className="material-symbols-outlined text-6xl opacity-20 mb-4">restaurant</span>
                      <p className="text-sm font-semibold">{tt("Chưa có món nào", "Noch keine Gerichte")}</p>
                    </div>
                  ) : currentItems.map((item, idx) => {
                    const sentQty = kitchenSent[currentTable]?.[item.id] || 0;
                    const newQty  = item.qty - sentQty;
                    return (
                      <div key={item.id} className={`flex gap-3 items-center group py-4 ${idx < currentItems.length - 1 ? "border-b border-stone-100" : ""}`}>
                        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-stone-100 shrink-0 shadow-sm border border-stone-200/50">
                          {item.image ? (
                            <img src={menuImageSrc(item.image)} className="w-full h-full object-cover" alt={item.name}/>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-stone-400"><span className="material-symbols-outlined text-xl">restaurant</span></div>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-stone-900 text-sm leading-tight line-clamp-1">{item.name}</h4>
                          {item.is_custom_line && (
                            <span className="inline-flex items-center px-1.5 py-px bg-violet-50 text-[9px] font-bold text-violet-700 rounded mt-0.5">
                              {tt("Ngoài menu", "Extra")}
                            </span>
                          )}
                          {newQty > 0 && <span className="inline-flex items-center px-1.5 py-px bg-orange-50 text-[9px] font-bold text-orange-600 rounded mt-0.5">+ {newQty} {tt("món mới", "neu")}</span>}
                        </div>
                        
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="flex items-center bg-stone-100 rounded-xl p-1 gap-1.5">
                            <button onClick={() => updateQty(item.id, "dec")} className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-stone-600 font-bold">-</button>
                            <span className="font-bold text-sm w-4 text-center">{item.qty}</span>
                            <button onClick={() => updateQty(item.id, "inc")} className="w-8 h-8 rounded-lg bg-primary text-white shadow-sm flex items-center justify-center font-bold">+</button>
                          </div>
                          <div className="text-right min-w-[70px]">
                            <div className="font-black text-sm text-stone-900">{formatMoney(item.price * item.qty)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

               <div className="pt-6 pb-6 border-t border-dashed border-stone-200 space-y-4 shrink-0">
                 <div className="flex justify-between items-end">
                   <span className="font-bold text-stone-400">Tổng thanh toán</span>
                   <span className="font-headline font-black text-3xl text-primary tracking-tight">{formatMoney(total)}</span>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-3 pb-safe">
                   <button
                     onClick={() => { printOrderTicket('ALL'); setShowMobileCart(false); }}
                     disabled={currentItems.length === 0}
                     className="py-4 bg-stone-100 text-stone-600 font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all text-sm"
                   >
                     GỬI BẾP / BAR
                   </button>
                   <button
                     onClick={() => { if (!isAdmin) return; handlePayment(); setShowMobileCart(false); }}
                     disabled={!isAdmin || currentItems.length === 0}
                     className="py-4 bg-primary text-white font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-300/40 text-sm"
                   >
                     THANH TOÁN
                   </button>
                 </div>
               </div>
            </aside>
          </div>
        </div>
      </div>
    )}
  </div>
);
}
