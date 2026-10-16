import { addDaysToDateStr, israelDateTime } from "@/lib/availability/grid";

// מפגשי ססיה עתידיים של משבצת שבועית — לבדיקת התנגשויות *לפני* שמירה
// (ניהול ססיות). אותו אופק כמו materialize_session_bookings (רולינג 90 יום):
// מעבר לו ה-cron עוד לא יוצר מפגשים, וההתנגשות תיבדק כשיגיע תורם.

export const MATERIALIZE_HORIZON_DAYS = 90;

export type SlotPattern = { roomId: string; weekday: number; startTime: string; endTime: string };
export type Occurrence = { roomId: string; date: string; startsAt: Date; endsAt: Date };

/** יום בשבוע (0 = ראשון) של מחרוזת תאריך — בלי תלות באזור הזמן המקומי. */
function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * כל המפגשים של המשבצות מ-`from` (כולל) עד `until` (כולל) או עד סוף האופק.
 * זמנים דרך israelDateTime — נכון גם ביום מעבר שעון.
 */
export function slotOccurrences(
  slots: SlotPattern[],
  from: string,
  until: string | null,
  today: string,
): Occurrence[] {
  const horizonEnd = addDaysToDateStr(today, MATERIALIZE_HORIZON_DAYS);
  const last = until && until < horizonEnd ? until : horizonEnd;
  const out: Occurrence[] = [];
  for (let d = from; d <= last; d = addDaysToDateStr(d, 1)) {
    const wd = weekdayOf(d);
    for (const s of slots) {
      if (s.weekday !== wd) continue;
      out.push({
        roomId: s.roomId,
        date: d,
        startsAt: israelDateTime(d, s.startTime),
        endsAt: israelDateTime(d, s.endTime),
      });
    }
  }
  return out;
}

/** חפיפה בחצי-פתוח [) — 09:00–10:00 ו-10:00–11:00 לא מתנגשים (חוק #8). */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}
