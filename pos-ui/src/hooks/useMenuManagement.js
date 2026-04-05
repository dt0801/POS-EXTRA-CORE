import { useCallback, useState } from "react";
import { API_URL } from "../config/api";
import { clearMenuCache } from "../utils/menuCache";

export default function useMenuManagement({
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
  defaultKitchenCategoryId = "MAIN",
}) {
  const [menuSaving, setMenuSaving] = useState(false);

  const addMenu = useCallback(async (priceCents) => {
    const cents = Math.max(0, Math.round(Number(priceCents) || 0));
    const formData = new FormData();
    formData.append("name", newItem.name);
    formData.append("price", String(cents));
    formData.append("type", newItem.type);
    if (newItem.type !== "DRINK") {
      formData.append("kitchen_category", newItem.kitchen_category || "MAIN");
    }
    if (file) formData.append("image", file);
    setMenuSaving(true);
    try {
      const res = await authedFetch(`${API_URL}/menu`, { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `HTTP ${res.status}`);
        return;
      }
      clearMenuCache();
      setNewItem({ name: "", type: "FOOD", kitchen_category: defaultKitchenCategoryId });
      setFile(null);
      await fetchMenu();
    } finally {
      setMenuSaving(false);
    }
  }, [authedFetch, defaultKitchenCategoryId, fetchMenu, file, newItem.kitchen_category, newItem.name, newItem.type, setFile, setNewItem]);

  const updateMenu = useCallback(async (priceCents) => {
    if (!editItem) return;
    const cents = Math.max(0, Math.round(Number(priceCents) || 0));
    const formData = new FormData();
    formData.append("name", editItem.name);
    formData.append("price", String(cents));
    formData.append("type", editItem.type);
    if (editItem.type !== "DRINK") {
      formData.append("kitchen_category", editItem.kitchen_category || "MAIN");
    }
    if (editFile) formData.append("image", editFile);
    setMenuSaving(true);
    try {
      const res = await authedFetch(`${API_URL}/menu/${editItem.id}`, { method: "PUT", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `HTTP ${res.status}`);
        return;
      }
      clearMenuCache();
      setEditItem(null);
      setEditFile(null);
      await fetchMenu();
    } finally {
      setMenuSaving(false);
    }
  }, [authedFetch, editFile, editItem, fetchMenu, setEditFile, setEditItem]);

  const deleteMenu = useCallback(async (id) => {
    if (!window.confirm("Xóa món này?")) return;
    setMenuSaving(true);
    try {
      const res = await authedFetch(`${API_URL}/menu/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `HTTP ${res.status}`);
        return;
      }
      clearMenuCache();
      await fetchMenu();
    } finally {
      setMenuSaving(false);
    }
  }, [authedFetch, fetchMenu]);

  return { addMenu, updateMenu, deleteMenu, menuSaving };
}
