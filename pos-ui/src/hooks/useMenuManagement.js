import { useCallback } from "react";
import { API_URL } from "../config/api";

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
    await authedFetch(`${API_URL}/menu`, { method: "POST", body: formData });
    setNewItem({ name: "", type: "FOOD", kitchen_category: defaultKitchenCategoryId });
    setFile(null);
    fetchMenu();
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
    await authedFetch(`${API_URL}/menu/${editItem.id}`, { method: "PUT", body: formData });
    setEditItem(null);
    setEditFile(null);
    fetchMenu();
  }, [authedFetch, editFile, editItem, fetchMenu, setEditFile, setEditItem]);

  const deleteMenu = useCallback(async (id) => {
    if (!window.confirm("Xóa món này?")) return;
    await authedFetch(`${API_URL}/menu/${id}`, { method: "DELETE" });
    fetchMenu();
  }, [authedFetch, fetchMenu]);

  return { addMenu, updateMenu, deleteMenu };
}
