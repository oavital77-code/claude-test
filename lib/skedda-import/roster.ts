import rosterData from "./roster.json";

/**
 * רשימת מטפלים ידועה מ-Skedda (venueusers.csv + bookings_1.csv, ר'
 * OPERATIONS.md §11) — snapshot סטטי, לא מתעדכן לבד. יש לבנות מחדש בכל
 * פעם שמתקבל ייצוא Skedda טרי (יחד עם 20260902000001 וממשיכיה).
 *
 * מפתח: טלפון בפורמט E.164 (זהה לפורמט של profiles.phone, ר' lib/phone.ts)
 * — התאמה מדויקת בלבד, בלי שום ניחוש לפי שם.
 */
export type SkeddaRosterEntry = {
  /** השם המלא כפי שנרשם ב-Skedda (venueusers.csv, או holder name מ-bookings). */
  fullName: string;
  /** תגיות Skedda (למשל "כרטיסייה 10 שעות", "לקוחות ססיה") — הקשר בלבד. */
  tags: string[];
  /**
   * ה-labels המדויקים (בלי הסיומת '· הועבר מ-Skedda') שהופיעו בפועל
   * ב-bookings_1.csv עבור הטלפון הזה — ניתן להתאים ישירות מול SkeddaGroup.label.
   * ריק אם לא נמצא אף booking עם holder name+phone לטלפון הזה (למשל מטפלת
   * שמופיעה רק בהזמנות מסוג "ססיה" בכותרת בלבד, בלי פרטי מחזיק ב-Skedda).
   */
  labels: string[];
};

const roster: Record<string, SkeddaRosterEntry> = (rosterData as { byPhone: Record<string, SkeddaRosterEntry> })
  .byPhone;

export function lookupSkeddaRoster(phone: string | null | undefined): SkeddaRosterEntry | null {
  if (!phone) return null;
  return roster[phone] ?? null;
}
