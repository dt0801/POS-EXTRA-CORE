function mapToLegacyPrinter(row) {
  return {
    id: Number(row.id || 0),
    printer_name: row.name,
    job_type: row.type || "ALL",
    paper_width: Number(row.paper_size || 80),
    is_active: Number(row.is_enabled) === 1,
    created_at: row.created_at || new Date().toISOString(),
  };
}

module.exports = { mapToLegacyPrinter };
