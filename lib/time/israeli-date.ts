// תצוגת תאריך ישראלית ממחרוזת yyyy-MM-dd — בלי Date מקומי (שמושפע מאזור
// הזמן של הדפדפן): "2026-10-17" → "17/10/2026 · שבת".
const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function formatIsraeliDate(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const [, y, mo, d] = m;
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay()];
  return `${d}/${mo}/${y} · ${weekday}`;
}
