const { exec } = require("child_process");

async function printTestConnection({ createPrinter }, body) {
  const { printer_key, ip, usb_name } = body || {};
  const label = printer_key || "printer";

  if (ip && ip.trim()) {
    const trimmedIp = ip.trim();
    try {
      console.log(`🔌 [${label}] Đang kết nối TCP → ${trimmedIp}...`);
      const printer = await createPrinter(trimmedIp);
      const connected = await printer.isPrinterConnected();
      if (connected) {
        console.log(`✅ [${label}] Kết nối TCP thành công: ${trimmedIp}`);
        return { status: 200, body: { connected: true, method: "IP", ip: trimmedIp } };
      }
      console.error(`❌ [${label}] TCP không phản hồi tại ${trimmedIp} – máy in tắt hoặc sai IP`);
    } catch (err) {
      console.error(`❌ [${label}] Lỗi TCP ${trimmedIp}: ${err.message}`);
    }
  }

  if (usb_name && usb_name.trim()) {
    const trimmedUsb = usb_name.trim();
    console.log(`🔌 [${label}] Đang kiểm tra USB: "${trimmedUsb}"...`);
    try {
      const cmd = `powershell -command "Get-Printer -Name '${trimmedUsb}' | Select-Object Name,PrinterStatus | ConvertTo-Json"`;
      return await new Promise((resolve) => {
        exec(cmd, { timeout: 5000 }, (err, stdout) => {
          if (err || !stdout.trim()) {
            console.error(`❌ [${label}] USB không tìm thấy máy in: "${trimmedUsb}" – kiểm tra lại tên`);
            resolve({
              status: 200,
              body: {
                connected: false,
                method: "USB",
                usb_name: trimmedUsb,
                error: "Không tìm thấy máy in",
              },
            });
            return;
          }
          try {
            const info = JSON.parse(stdout.trim());
            const online = info.PrinterStatus === 0;
            if (online) {
              console.log(`✅ [${label}] USB OK: "${trimmedUsb}" – Status: Ready`);
            } else {
              console.error(
                `⚠️  [${label}] USB tìm thấy nhưng không sẵn sàng: "${trimmedUsb}" – Status: ${info.PrinterStatus}`
              );
            }
            resolve({
              status: 200,
              body: { connected: online, method: "USB", usb_name: trimmedUsb },
            });
          } catch {
            console.error(`❌ [${label}] USB parse lỗi cho: "${trimmedUsb}"`);
            resolve({
              status: 200,
              body: {
                connected: false,
                method: "USB",
                usb_name: trimmedUsb,
                error: "Không tìm thấy máy in",
              },
            });
          }
        });
      });
    } catch (err) {
      console.error(`❌ [${label}] Lỗi kiểm tra USB: ${err.message}`);
    }
  }

  if (!ip && !usb_name) {
    console.error(`❌ [${label}] Chưa nhập IP hoặc tên USB`);
  } else {
    console.error(`❌ [${label}] Không kết nối được – IP: ${ip || "–"}, USB: ${usb_name || "–"}`);
  }
  return { status: 200, body: { connected: false, error: "Không kết nối được máy in" } };
}

module.exports = { printTestConnection };
