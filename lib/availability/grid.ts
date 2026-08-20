import { addDays, parseISO } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { TIMEZONE, BOOKING_BLOCK_MINUTES } from "@/lib/time";

/** גבולות היממה (00:00-24:00 לפי שעון ישראל) כ-UTC instants. */
export function dayBoundaries(dateStr: string): { start: Date; end: Date } {
  const start = fromZonedTime(`${dateStr}T00:00:00`, TIMEZONE);
  const nextDateStr = formatInTimeZone(addDays(parseISO(dateStr), 1), "UTC", "yyyy-MM-dd");
  const end = fromZonedTime(`${nextDateStr}T00:00:00`, TIMEZONE);
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

export function addDaysToDateStr(dateStr: string, days: number): string {
  return formatInTimeZone(addDays(parseISO(dateStr), days), "UTC", "yyyy-MM-dd");
}

export function weekDatesStartingSunday(dateStr: string): string[] {
  const weekday = parseISO(dateStr).getUTCDay(); // 0 = ראשון, תואם parseISO של תאריך בלבד (UTC)
  const sunday = addDaysToDateStr(dateStr, -weekday);
  return Array.from({ length: 7 }, (_, i) => addDaysToDateStr(sunday, i));
}
