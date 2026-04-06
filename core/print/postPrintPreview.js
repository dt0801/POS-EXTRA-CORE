function postPrintPreview({ buildReceiptHtml }, body) {
  try {
    const { receipt, paper_size, css_override } = body || {};
    if (!receipt || !Array.isArray(receipt.items)) {
      return { status: 400, body: { error: "Thiếu dữ liệu receipt hợp lệ" } };
    }
    const html = buildReceiptHtml(receipt, Number(paper_size) || 80, css_override);
    return { status: 200, body: { html } };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

module.exports = { postPrintPreview };
