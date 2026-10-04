// טיפוסים בלבד — בלי תלות ב-@hebcal/core, כדי שרכיבי client יוכלו לייבא
// אותם בלי למשוך את ספריית הלוח העברי לבאנדל של הדפדפן. החישוב עצמו
// רץ בשרת (lib/holidays.ts) ומגיע לרכיבים כ-prop רגיל.

/**
 * chag      — יום טוב (ראש השנה, יום כיפור, סוכות, שמיני עצרת, פסח, שבועות).
 *             מוצג בולט: בפועל רוב המטפלים לא עובדים.
 * erev      — ערב חג (ערב ראש השנה, ערב יום כיפור, ערב פסח...). יום עבודה מקוצר.
 * cholHamoed— חול המועד סוכות/פסח.
 * national  — יום השואה, יום הזיכרון, יום העצמאות, יום ירושלים.
 * minor     — חנוכה, פורים, ט״ו בשבט, ל״ג בעומר, תשעה באב.
 */
export type HolidayKind = "chag" | "erev" | "cholHamoed" | "national" | "minor";

export interface Holiday {
  name: string;
  kind: HolidayKind;
}

/** מפתח: תאריך בפורמט yyyy-MM-dd (אותו פורמט שהלוחות משתמשים בו לימים). */
export type HolidayMap = Record<string, Holiday[]>;
