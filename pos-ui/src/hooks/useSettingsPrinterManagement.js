import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL } from "../config/api";
import { fetchSettings, saveAllSettings as saveAllSettingsRequest } from "../services/settingsService";
import {
  addDbPrinter as addDbPrinterRequest,
  fetchDbPrinters as fetchDbPrintersRequest,
  fetchWindowsPrinters as fetchWindowsPrintersRequest,
} from "../services/printerService";

export default function useSettingsPrinterManagement({ authUser, authValidated, sidebarView, authedFetch }) {
  const [settings, setSettings] = useState({
    printer_ip: "",
    printer_type: "",
    store_name: "",
    store_address: "",
    store_phone: "",
    cashier_name: "",
    total_tables: "20",
    bill_css_override: "",
  });
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [windowsPrinters, setWindowsPrinters] = useState([]);
  const [dbPrinters, setDbPrinters] = useState([]);
  const [newPrinter, setNewPrinter] = useState({ name: "", type: "ALL", paper_size: 80, is_enabled: 1 });
  const [loadingDbPrinters, setLoadingDbPrinters] = useState(false);

  const [settingsPreviewHtml, setSettingsPreviewHtml] = useState("");
  const [settingsPreviewPaper, setSettingsPreviewPaper] = useState(80);
  const [settingsPreviewLoading, setSettingsPreviewLoading] = useState(false);

  useEffect(() => {
    if (!authUser || !authValidated) return;
    fetchSettings()
      .then((d) => setSettings((prev) => ({ ...prev, ...d })))
      .catch(() => {});
  }, [authUser, authValidated]);

  const saveAllSettings = useCallback(async () => {
    await saveAllSettingsRequest(settings);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }, [settings]);

  const fetchWindowsPrinters = useCallback(async () => {
    try {
      const data = await fetchWindowsPrintersRequest();
      setWindowsPrinters(data);
    } catch {
      setWindowsPrinters([]);
    }
  }, []);

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

  const addDbPrinter = useCallback(async () => {
    if (!newPrinter.name) return alert("Vui lòng chọn tên máy in");
    try {
      await addDbPrinterRequest(newPrinter);
      setNewPrinter({ name: "", type: "ALL", paper_size: 80, is_enabled: 1 });
      fetchDbPrinters();
    } catch (e) {
      alert("Lỗi thêm máy in");
    }
  }, [fetchDbPrinters, newPrinter]);

  const updateDbPrinter = useCallback(async (p, updates) => {
    try {
      await authedFetch(`${API_URL}/windows_printers/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, ...updates }),
      });
      fetchDbPrinters();
    } catch (e) {
      alert("Lỗi cập nhật máy in");
    }
  }, [authedFetch, fetchDbPrinters]);

  const deleteDbPrinter = useCallback(async (id) => {
    if (!window.confirm("Xóa cấu hình máy in này?")) return;
    try {
      await authedFetch(`${API_URL}/windows_printers/${id}`, { method: "DELETE" });
      fetchDbPrinters();
    } catch (e) {
      alert("Lỗi xóa máy in");
    }
  }, [authedFetch, fetchDbPrinters]);

  useEffect(() => {
    if (sidebarView === "settings" && authUser && authValidated) {
      fetchDbPrinters();
      fetchWindowsPrinters();
    }
  }, [sidebarView, authUser, authValidated, fetchDbPrinters, fetchWindowsPrinters]);

  const buildSettingsPreviewPayload = useMemo(() => (() => ({
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
  })), [settings.store_name, settings.store_address, settings.store_phone, settings.cashier_name]);

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
  }, [authedFetch, buildSettingsPreviewPayload, settings.bill_css_override, settingsPreviewPaper, sidebarView]);

  useEffect(() => {
    if (sidebarView !== "settings" || !authUser || !authValidated) return;
    const t = setTimeout(() => refreshSettingsBillPreview(), 200);
    return () => clearTimeout(t);
  }, [sidebarView, authUser, authValidated, settings.bill_css_override, settingsPreviewPaper, settings.store_name, settings.store_address, settings.store_phone, refreshSettingsBillPreview]);

  return {
    settings,
    setSettings,
    settingsSaved,
    saveAllSettings,
    windowsPrinters,
    fetchWindowsPrinters,
    dbPrinters,
    loadingDbPrinters,
    newPrinter,
    setNewPrinter,
    addDbPrinter,
    updateDbPrinter,
    deleteDbPrinter,
    settingsPreviewHtml,
    settingsPreviewPaper,
    setSettingsPreviewPaper,
    settingsPreviewLoading,
    refreshSettingsBillPreview,
  };
}
