import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { he } from "date-fns/locale";

export const TIMEZONE = "Asia/Jerusalem";
export const BUFFER_MINUTES = 5;
export const BOOKING_BLOCK_MINUTES = 30;

/**
 * "כניסה בפועל" / "פינוי" — תצוגה בלבד. חישובי חפיפה תמיד על starts_at/ends_at המקוריים.
 * ר' baclinica-spec.md §3.6.
 */
export function accessWindow(startsAt: Date, endsAt: Date) {
  return {
    accessStart: new Date(startsAt.getTime() - BUFFER_MINUTES * 60_000),
    accessEnd: new Date(endsAt.getTime() - BUFFER_MINUTES * 60_000),
  };
}

export function isAlignedTo30Minutes(date: Date) {
  const zoned = toZonedTime(date, TIMEZONE);
  return zoned.getMinutes() % BOOKING_BLOCK_MINUTES === 0 && zoned.getSeconds() === 0;
}

export function formatDateHe(date: Date) {
  return formatInTimeZone(date, TIMEZONE, "dd/MM/yyyy", { locale: he });
}

export function formatTimeHe(date: Date) {
  return formatInTimeZone(date, TIMEZONE, "HH:mm", { locale: he });
}

export function formatDateTimeHe(date: Date) {
  return formatInTimeZone(date, TIMEZONE, "dd/MM/yyyy HH:mm", { locale: he });
}
