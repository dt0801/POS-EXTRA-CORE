import { useCallback, useState } from "react";
import { API_URL } from "../config/api";

export default function useTableManagement({
  authedFetch,
  tableList,
  setTableList,
  newTableNum,
  setNewTableNum,
  editingTable,
  setEditingTable,
  fetchTableList,
  fetchTableStatus,
}) {
  const [tableMsg, setTableMsg] = useState(null);

  const showTableMsg = useCallback((type, text) => {
    setTableMsg({ type, text });
    setTimeout(() => setTableMsg(null), 3000);
  }, []);

  const addTable = useCallback(async () => {
    const num = Number(newTableNum);
    if (!num || num < 1) return showTableMsg("err", "Số bàn không hợp lệ");

    if (tableList.some((t) => t.table_num === num)) {
      return showTableMsg("err", `Bàn ${num} đã tồn tại`);
    }

    await authedFetch(`${API_URL}/tables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table_num: num }),
    });

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
  }, [authedFetch, fetchTableList, fetchTableStatus, newTableNum, setNewTableNum, showTableMsg, tableList]);

  const renameTable = useCallback(async () => {
    if (!editingTable) return;
    const { table_num, new_num } = editingTable;
    if (!new_num || Number(new_num) < 1) return showTableMsg("err", "Số bàn không hợp lệ");
    if (Number(new_num) === table_num) {
      setEditingTable(null);
      return;
    }

    const res = await authedFetch(`${API_URL}/tables/${table_num}`, {
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
  }, [authedFetch, editingTable, fetchTableList, fetchTableStatus, setEditingTable, showTableMsg]);

  const deleteTable = useCallback(async (num) => {
    if (!window.confirm(`Xóa Bàn ${num}? Bàn sẽ bị xóa khỏi danh sách.`)) return;
    const inDb = tableList.find((t) => t.table_num === num);
    if (inDb) {
      const res = await authedFetch(`${API_URL}/tables/${num}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) return showTableMsg("err", data.error);
    }

    setTableList((prev) => prev.filter((t) => t.table_num !== num));
    showTableMsg("ok", `Đã xóa Bàn ${num}`);
    fetchTableStatus();
  }, [authedFetch, fetchTableStatus, setTableList, showTableMsg, tableList]);

  return {
    tableMsg,
    addTable,
    renameTable,
    deleteTable,
  };
}
