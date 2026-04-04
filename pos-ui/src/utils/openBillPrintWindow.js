/** Mở cửa sổ in HTML bill (thermal / trình duyệt). */
export function openBillPrintWindow(html) {
  const win = window.open("", "_blank", "width=420,height=720");
  if (!win) {
    alert("Trình duyệt đã chặn cửa sổ popup — cho phép popup để in.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } finally {
      win.close();
    }
  }, 300);
}
