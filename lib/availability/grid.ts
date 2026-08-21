import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { TIMEZONE, BOOKING_BLOCK_MINUTES } from "@/lib/time";

// בכוונה לא date-fns parseISO/addDays: הן פועלות בזמן מקומי של הדפדפן/שרת,
// מה שגורם לחישוב שגוי של "היום הבא" באזורי זמן קדימה מ-UTC (כמו ישראל) —
// כאן הכל מחרוזת-תאריך <-> UTC, בלי תלות באזור הזמן המקומי בכלל.
function utcDateFromDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = utcDateFromDateStr(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatInTimeZone(d, "UTC", "yyyy-MM-dd");
}

/** גבולות היממה (00:00-24:00 לפי שעון ישראל) כ-UTC instants. */
export function dayBoundaries(dateStr: string): { start: Date; end: Date } {
  const start = fromZonedTime(`${dateStr}T00:00:00`, TIMEZONE);
  const end = fromZonedTime(`${addDaysToDateStr(dateStr, 1)}T00:00:00`, TIMEZONE);
  return { start, end };
}

export interface Slot {
  start: Date;
  end: Date;
}

/** 48 בלוקים של 30 דקות ליום נתון. ר' spec §3.7. */
export function daySlots(dateStr: string): Slot[] {
  const { start } = dayBoundaries(dateStr);
  const count = (24 * 60) / BOOKING_BLOCK_MINUTES;
  return Array.from({ length: count }, (_, i) => {
    const slotStart = new Date(start.getTime() + i * BOOKING_BLOCK_MINUTES * 60_000);
    const slotEnd = new Date(slotStart.getTime() + BOOKING_BLOCK_MINUTES * 60_000);
    return { start: slotStart, end: slotEnd };
  });
}

export function todayInIsrael(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

export function weekDatesStartingSunday(dateStr: string): string[] {
  const weekday = utcDateFromDateStr(dateStr).getUTCDay(); // 0 = ראשון
  const sunday = addDaysToDateStr(dateStr, -weekday);
  return Array.from({ length: 7 }, (_, i) => addDaysToDateStr(sunday, i));
}
