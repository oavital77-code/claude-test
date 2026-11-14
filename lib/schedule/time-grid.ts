/**
 * לוח זמנים "לפי קנה מידה" — הלוגיקה הטהורה של פתיחת הזמנה ישירות מהלוח:
 * ריחוף שמראה איפה תיפתח מסגרת, הקשה שפותחת אותה, גרירה ומתיחה שנצמדות
 * לחצאי שעות. אין כאן React ואין גישה ל-DB.
 *
 * כל הזמנים כאן הם **דקות מתחילת היום המקומי** (שעון ישראל) של העמודה.
 * המרה ל-Date ובחזרה רק דרך israelDateTime / israelHHmm — לעולם לא "חצות + X"
 * (ר' no-midnight-arithmetic.test.ts), כדי שיום מעבר שעון לא יזיז שעות.
 *
 * זו שכבת UX בלבד: החפיפה האמיתית נאכפת ב-DB (create_booking + אילוץ GiST,
 * חוקי ברזל #1–#2). הבדיקות כאן רק מונעות להציע למטפל/ת זמן שכבר לא פנוי.
 */
import { GRID_END_HOUR, GRID_START_HOUR, israelDateTime, israelHHmm } from "@/lib/availability/grid";
import type { AvailabilityInterval, BookingSource } from "@/lib/availability/types";

export const STEP = 30; // הכול נצמד לחצאי שעות (BOOKING_BLOCK_MINUTES)
export const DEFAULT_MINUTES = 60; // לחיצה פותחת שעה (החלטת הבעלים, 14/11)
export const DAY_START = GRID_START_HOUR * 60;
export const DAY_END = GRID_END_HOUR * 60;

export type Span = { start: number; end: number };
export type Proposal = { start: number; end: number; fits: boolean };

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const toTime = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/** מיקום וגובה בפיקסלים של טווח דקות, בתוך יום שמתחיל ב-DAY_START. */
export function place(start: number, end: number, hourHeight: number) {
  const top = ((start - DAY_START) / 60) * hourHeight;
  const height = Math.max(((end - start) / 60) * hourHeight, 14);
  return { top, height };
}

const overlaps = (items: Span[], start: number, end: number) =>
  items.some((it) => it.start < end && it.end > start);

/**
 * איפה תיפתח מסגרת כשמקישים על זמן ריק: בחצי השעה שהוקשה, ואחרי כל מה
 * שמתחיל לפני ההקשה ונגמר אחריה (כדי שלא תשב על הזמנה קיימת). 09:00–10:00
 * ו-10:00–11:00 לא מתנגשים — [start, end) כמו ב-DB.
 */
export function proposeStart(items: Span[], tapped: number, duration: number) {
  let start = Math.floor(tapped / STEP) * STEP;
  for (const it of items) if (it.start <= tapped && it.end > start) start = Math.max(start, it.end);
  const end = start + duration;
  return { start, fits: end <= DAY_END && !overlaps(items, start, end) };
}

/**
 * המסגרת שנפתחת בלחיצה: שעה (DEFAULT_MINUTES). אם רק חצי שעה פנויה שם (פער
 * של חצי שעה בין הזמנות, או 21:30) — חצי שעה, כדי שמה שאפשר להזמין היום
 * בלחיצה אחת יישאר אפשרי בלחיצה אחת.
 */
export function defaultFrame(items: Span[], tapped: number): Proposal {
  const full = proposeStart(items, tapped, DEFAULT_MINUTES);
  if (full.fits) return { start: full.start, end: full.start + DEFAULT_MINUTES, fits: true };
  const half = proposeStart(items, tapped, STEP);
  if (half.fits) return { start: half.start, end: half.start + STEP, fits: true };
  return { start: full.start, end: full.start + DEFAULT_MINUTES, fits: false };
}

/** למקלדת (אין מיקום): המסגרת הראשונה מ-from והלאה שנכנסת. */
export function firstFreeFrame(items: Span[], from: number): Proposal | null {
  for (let t = Math.ceil(from / STEP) * STEP; t + STEP <= DAY_END; t += STEP) {
    const p = defaultFrame(items, t);
    if (p.fits && p.start === t) return p;
  }
  return null;
}

/** הזזה: נקודת ההתחלה + כמה זזו, מעוגל לחצי שעה וחסום בגבולות היום. */
export function dragTo(items: Span[], from: Span, moved: number): Proposal {
  const duration = from.end - from.start;
  const raw = Math.round((from.start + moved) / STEP) * STEP;
  const start = Math.min(Math.max(raw, DAY_START), DAY_END - duration);
  const end = start + duration;
  return { start, end, fits: !overlaps(items, start, end) };
}

/** מתיחה: הקצה שנגרר זז לחצי השעה הקרובה והשני נשאר. מינימום חצי שעה, בתוך היום. */
export function resizeTo(items: Span[], from: Span, edge: "start" | "end", moved: number): Proposal {
  let { start, end } = from;
  if (edge === "start") {
    const raw = Math.round((from.start + moved) / STEP) * STEP;
    start = Math.min(Math.max(raw, DAY_START), from.end - STEP);
  } else {
    const raw = Math.round((from.end + moved) / STEP) * STEP;
    end = Math.max(Math.min(raw, DAY_END), from.start + STEP);
  }
  return { start, end, fits: !overlaps(items, start, end) };
}

/** טווח דקות בעמודה (תאריך מקומי) → רגעים אמיתיים, בדיוק כמו resolveSlot הישן. */
export function toInstants(dateStr: string, span: Span): { start: Date; end: Date } {
  return { start: israelDateTime(dateStr, toTime(span.start)), end: israelDateTime(dateStr, toTime(span.end)) };
}

/**
 * רגעים → דקות בעמודה, חתוך לטווח התצוגה (07:00–22:00). null אם אין חפיפה
 * לטווח של התאריך הזה.
 */
export function toSpan(dateStr: string, startsAt: Date, endsAt: Date): Span | null {
  const lo = israelDateTime(dateStr, toTime(DAY_START));
  const hi = israelDateTime(dateStr, toTime(DAY_END));
  if (startsAt >= hi || endsAt <= lo) return null;
  const s = startsAt < lo ? lo : startsAt;
  const e = endsAt > hi ? hi : endsAt;
  return { start: toMinutes(israelHHmm(s)), end: toMinutes(israelHHmm(e)) };
}

export type ColumnBlocks = {
  /** כל מה שתופס זמן (לבדיקת התאמה) — שלי + לא זמין. */
  busy: Span[];
  /** ההזמנות שלי, עם הזמנים המלאים (לתווית) ומקור (לצבע). */
  mine: (Span & { source?: BookingSource; startsAt: Date; endsAt: Date })[];
  /**
   * "לא זמין": הזמנות של אחרים + חסימות, **ממוזגים** לבלוקים רציפים. כך הלוח
   * לא חושף כמה הזמנות יש שם ומה אורך כל אחת — אותו מידע בדיוק כמו התאים
   * האפורים בלוח הישן (חוק ברזל #3).
   */
  unavailable: Span[];
};

export function columnBlocks(dateStr: string, intervals: AvailabilityInterval[] | undefined): ColumnBlocks {
  const mine: ColumnBlocks["mine"] = [];
  const others: Span[] = [];
  for (const iv of intervals ?? []) {
    const span = toSpan(dateStr, iv.startsAt, iv.endsAt);
    if (!span) continue;
    if (iv.status === "mine") mine.push({ ...span, source: iv.source, startsAt: iv.startsAt, endsAt: iv.endsAt });
    else others.push(span);
  }
  others.sort((a, b) => a.start - b.start);
  const unavailable: Span[] = [];
  for (const s of others) {
    const last = unavailable[unavailable.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else unavailable.push({ ...s });
  }
  mine.sort((a, b) => a.start - b.start);
  return { busy: [...mine, ...unavailable], mine, unavailable };
}

/**
 * הרחבה בלחיצה נוספת באותה עמודה (ההתנהגות של הלוח הישן): האיחוד של הבחירה
 * הקיימת והמסגרת החדשה, אם כולו פנוי. אחרת null — מתחילים בחירה חדשה.
 */
export function extendSelection(items: Span[], current: Span, next: Span): Span | null {
  const start = Math.min(current.start, next.start);
  const end = Math.max(current.end, next.end);
  return overlaps(items, start, end) ? null : { start, end };
}
