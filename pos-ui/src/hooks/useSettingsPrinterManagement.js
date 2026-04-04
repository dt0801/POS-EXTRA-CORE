import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../config/api";
import { fetchSettings, saveAllSettings as saveAllSettingsRequest } from "../services/settingsService";
import { DEFAULT_KITCHEN_CATEGORIES_JSON } from "../constants/kitchenCategories";
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
    kitchen_categories_json: DEFAULT_KITCHEN_CATEGORIES_JSON,
  });
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [windowsPrinters, setWindowsPrinters] = useState([]);
  const [dbPrinters, setDbPrinters] = useState([]);
  const [newPrinter, setNewPrinter] = useState({ name: "", type: "ALL", paper_size: 80, is_enabled: 1 });
  const [loadingDbPrinters, setLoadingDbPrinters] = useState(false);

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

  /** Gộp partial vào state hiện tại rồi lưu — dùng khi cần persist ngay (vd. kitchen_categories_json). */
  const mergeAndSaveSettings = useCallback(async (partial) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    await saveAllSettingsRequest(next);
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

  return {
    settings,
    setSettings,
    settingsSaved,
    saveAllSettings,
    mergeAndSaveSettings,
    windowsPrinters,
    fetchWindowsPrinters,
    dbPrinters,
    loadingDbPrinters,
    newPrinter,
    setNewPrinter,
    addDbPrinter,
    updateDbPrinter,
    deleteDbPrinter,
  };
}
