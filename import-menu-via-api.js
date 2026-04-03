const fs = require("fs");
const path = require("path");

const MENU_FILE_PATH = path.join(__dirname, "menu-export-1775196614743.json");
const API_URL = (process.env.API_URL || "https://pos-extra-core.onrender.com").trim().replace(/\/+$/, "");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildMultipartFormData(fields) {
  const boundary = "----pos-boundary-" + Math.random().toString(16).slice(2);
  let body = "";

  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    body += `${String(value ?? "")}\r\n`;
  }

  body += `--${boundary}--\r\n`;

  return {
    boundary,
    body,
  };
}

async function run() {
  console.log("Đọc file menu JSON...");
  const items = JSON.parse(fs.readFileSync(MENU_FILE_PATH, "utf8"));
  console.log(`Tổng ${items.length} món trong file.`);

  console.log("Login admin...");
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  if (!loginRes.ok) {
    const txt = await loginRes.text().catch(() => "");
    throw new Error(`Login failed: HTTP ${loginRes.status}. ${txt}`);
  }
  const loginData = await loginRes.json();
  const token = loginData?.token;
  if (!token) throw new Error("Login success nhưng không có token trả về");
  console.log("Login OK.");

  const authHeaders = {
    Authorization: `Bearer ${token}`,
  };

  console.log("Lấy menu cũ để xóa...");
  const oldRes = await fetch(`${API_URL}/menu`, { headers: authHeaders });
  if (!oldRes.ok) {
    const txt = await oldRes.text().catch(() => "");
    throw new Error(`GET /menu failed: HTTP ${oldRes.status}. ${txt}`);
  }
  const oldMenu = await oldRes.json();
  const oldIds = Array.isArray(oldMenu) ? oldMenu.map((m) => Number(m.id)).filter((x) => Number.isFinite(x)) : [];
  console.log(`Menu cũ: ${oldIds.length} món.`);

  console.log("Xóa menu cũ...");
  let deleted = 0;
  for (const id of oldIds) {
    const delRes = await fetch(`${API_URL}/menu/${id}`, { method: "DELETE", headers: authHeaders });
    if (!delRes.ok) {
      const txt = await delRes.text().catch(() => "");
      throw new Error(`DELETE /menu/${id} failed: HTTP ${delRes.status}. ${txt}`);
    }
    deleted++;
    if (deleted % 25 === 0) {
      console.log(`Đã xóa ${deleted}/${oldIds.length} món...`);
    }
    await sleep(25);
  }
  console.log(`Xóa xong: ${deleted} món.`);

  console.log("Import menu mới...");
  let added = 0;
  for (const item of items) {
    const name = item?.name || "";
    const price = Number.isFinite(Number(item?.price)) ? String(Number(item.price)) : String(item?.price ?? "0");
    const type = item?.type || "FOOD";

    const { boundary, body } = buildMultipartFormData({ name, price, type });

    const postRes = await fetch(`${API_URL}/menu`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!postRes.ok) {
      const txt = await postRes.text().catch(() => "");
      throw new Error(`POST /menu failed at item.id=${item?.id}: HTTP ${postRes.status}. ${txt}`);
    }
    await postRes.json().catch(() => ({}));

    added++;
    if (added % 25 === 0) {
      console.log(`Đã import ${added}/${items.length} món...`);
    }
    await sleep(25);
  }

  console.log(`Hoàn tất import: đã thêm ${added}/${items.length} món.`);
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Lỗi import menu qua API:", e?.message || e);
    process.exit(1);
  });

