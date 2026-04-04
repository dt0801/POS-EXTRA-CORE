import { API_URL } from "../config/api";
import { effectiveKitchenCategory, parseKitchenCategoriesList } from "../constants/kitchenCategories";

// Giá trong DB đang lưu theo đơn vị cent (ví dụ 726 = 7.26€)
export const formatMoney = (n) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    (Number(n) || 0) / 100
  );

export const menuImageSrc = (image) => {
  if (!image) return "";
  const s = String(image).trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `${API_URL}/uploads/${s}`;
};

export const removeTones = (str) => {
  const map = {
    "à": "a", "á": "a", "ả": "a", "ã": "a", "ạ": "a",
    "ă": "a", "ắ": "a", "ằ": "a", "ẳ": "a", "ẵ": "a", "ặ": "a",
    "â": "a", "ấ": "a", "ầ": "a", "ẩ": "a", "ẫ": "a", "ậ": "a",
    "đ": "d",
    "è": "e", "é": "e", "ẻ": "e", "ẽ": "e", "ẹ": "e",
    "ê": "e", "ế": "e", "ề": "e", "ể": "e", "ễ": "e", "ệ": "e",
    "ì": "i", "í": "i", "ỉ": "i", "ĩ": "i", "ị": "i",
    "ò": "o", "ó": "o", "ỏ": "o", "õ": "o", "ọ": "o",
    "ô": "o", "ố": "o", "ồ": "o", "ổ": "o", "ỗ": "o", "ộ": "o",
    "ơ": "o", "ớ": "o", "ờ": "o", "ở": "o", "ỡ": "o", "ợ": "o",
    "ù": "u", "ú": "u", "ủ": "u", "ũ": "u", "ụ": "u",
    "ư": "u", "ứ": "u", "ừ": "u", "ử": "u", "ữ": "u", "ự": "u",
    "ỳ": "y", "ý": "y", "ỷ": "y", "ỹ": "y", "ỵ": "y",
  };
  return str.toLowerCase().split("").map((c) => map[c] || c).join("");
};

/**
 * @param {object[]} menu
 * @param {string} filter — ALL | COMBO | DRINK | id danh mục bếp | (legacy) KHAI_VI…
 * @param {object} [settings] — cần để lọc theo kitchen_category / effectiveKitchenCategory
 */
export const filterMenu = (menu, filter, settings) => {
  if (filter === "ALL") return menu;
  if (filter === "COMBO") return menu.filter((m) => m.type === "COMBO");
  if (filter === "DRINK") return menu.filter((m) => m.type === "DRINK");

  if (settings) {
    const kitchenIds = new Set(parseKitchenCategoriesList(settings).map((c) => c.id));
    if (kitchenIds.has(filter)) {
      return menu.filter((m) => effectiveKitchenCategory(m, settings) === filter);
    }
  }

  const r = (m) => removeTones(m.name);
  const has = (m, ...keys) => keys.some((k) => r(m).includes(removeTones(k)));
  const hasN = (m, ...keys) => !keys.some((k) => r(m).includes(removeTones(k)));

  const map = {
    KHAI_VI: (m) => has(m, "xuc xich", "khoai tay", "salad"),
    SIGNATURE: (m) => has(m, "oc nhoi", "heo moi", "nai xao", "nai xong", "dat vang", "tieu xanh"),
    NHAU: (m) => has(m, "sun ga chien", "chan ga chien", "canh ga chien", "ech chien gion", "ca trung chien"),
    GA: (m) => has(m, "ga") && hasN(m, "chien man", "sun ga", "ca trum", "ra lau"),
    BO: (m) => has(m, "bo") && hasN(m, "bun bo", "ra bo"),
    HEO: (m) => has(m, "heo", "nai", "suon heo"),
    ECH: (m) => has(m, "ech"),
    CA: (m) => has(m, "ca trung nuong", "ca tam nuong"),
    LUON: (m) => has(m, "luon ngong"),
    SO_DIEP: (m) => has(m, "so diep"),
    HAISAN: (m) => has(m, "tom", "muc", "bach tuoc"),
    RAU: (m) => has(m, "rau muong", "rau cu xao", "rau rung", "mang tay xao"),
    LAU: (m) => has(m, "lau", "dia lau", "nam kim cham", "mi goi", "rau lau") && hasN(m, "ca tau mang"),
    COM_MI: (m) => has(m, "com chien", "mi xao", "com lam"),
  };
  const fn = map[filter];
  return fn ? menu.filter(fn) : menu;
};

export const calcTotal = (tableData = {}) =>
  Object.values(tableData).reduce((s, i) => s + i.price * i.qty, 0);

export const calcTotalQty = (tableData = {}) =>
  Object.values(tableData).reduce((s, i) => s + i.qty, 0);
