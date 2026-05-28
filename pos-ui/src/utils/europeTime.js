export const EUROPE_TIME_ZONE = "Europe/Berlin";

function getEuropeDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: EUROPE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = {};
  parts.forEach((p) => {
    if (p.type !== "literal") map[p.type] = p.value;
  });
  return map;
}

export function getEuropeDateISO(date = new Date()) {
  const p = getEuropeDateParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function getEuropeMonthISO(date = new Date()) {
  return getEuropeDateISO(date).slice(0, 7);
}

export function getEuropeYear(date = new Date()) {
  return getEuropeDateISO(date).slice(0, 4);
}

export function formatEuropeDateTime(date = new Date(), locale = "vi-VN") {
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
