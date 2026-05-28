const EUROPE_TIME_ZONE = "Europe/Berlin";

function getEuropeDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: EUROPE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = {};
  parts.forEach((p) => {
    if (p.type !== "literal") map[p.type] = p.value;
  });
  return map;
}

function getEuropeDateISO(date = new Date()) {
  const p = getEuropeDateParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function getEuropeMonthISO(date = new Date()) {
  return getEuropeDateISO(date).slice(0, 7);
}

function getEuropeYear(date = new Date()) {
  return getEuropeDateISO(date).slice(0, 4);
}

function getEuropeDateTimeString(date = new Date()) {
  const p = getEuropeDateParts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function formatEuropeDateTime(date = new Date(), locale = "vi-VN") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: EUROPE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

module.exports = {
  EUROPE_TIME_ZONE,
  formatEuropeDateTime,
  getEuropeDateISO,
  getEuropeDateTimeString,
  getEuropeMonthISO,
  getEuropeYear,
};
