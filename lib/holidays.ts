import { HebrewCalendar, flags, type Event } from "@hebcal/core";
import { addDaysToDateStr, todayInIsrael } from "./availability/grid";
import type { Holiday, HolidayKind, HolidayMap } from "./holiday-types";

// חגים ומועדי ישראל ללוח הזמנים. החישוב אופליין (@hebcal/core), בלי קריאות
// רשת, ורץ בשרת בלבד — הרכיבים מקבלים HolidayMap מוכן כ-prop, כך שהספרייה
// לא נכנסת לבאנדל של הדפדפן (ר' lib/holiday-types.ts).
//
// הרשימה מאוצרת בכוונה. hebcal מחזיר גם עשרות מועדים שאינם רלוונטיים ללוח
// של קליניקה (חג הסיגד, יום בן-גוריון, פורים קטן, ראש השנה למעשר בהמה...),
// ולכן הסינון הוא whitelist לפי שם — לא blacklist — כדי שמועד חדש שיתווסף
// בגרסה עתידית של הספרייה לא יופיע פתאום בלוח בלי שמישהו החליט על כך.

const NATIONAL = new Set(["Yom HaShoah", "Yom HaZikaron", "Yom HaAtzma'ut", "Yom Yerushalayim"]);
const MINOR = new Set(["Purim", "Tu BiShvat", "Lag BaOmer", "Tish'a B'Av"]);
const EREV = new Set(["Erev Rosh Hashana", "Erev Yom Kippur", "Erev Sukkot", "Erev Pesach", "Erev Shavuot"]);

// שמות קצרים לתאים צרים. "שמחת תורה" ולא "שמיני עצרת": בארץ זה אותו יום,
// וכך הוא מוכר. חול המועד תמיד "חוה״מ" — בלי ב׳/ג׳/ד׳.
const SHORT: Record<string, string> = {
  "Erev Rosh Hashana": "ערב ר״ה",
  "Rosh Hashana II": "ראש השנה ב׳",
  "Erev Yom Kippur": "ערב כיפור",
  "Yom Kippur": "יום כיפור",
  "Erev Sukkot": "ערב סוכות",
  "Sukkot I": "סוכות",
  "Sukkot VII (Hoshana Raba)": "הושענא רבה",
  "Shmini Atzeret": "שמחת תורה",
  "Erev Pesach": "ערב פסח",
  "Pesach I": "פסח",
  "Pesach VII": "שביעי של פסח",
  "Erev Shavuot": "ערב שבועות",
  Shavuot: "שבועות",
  "Yom HaShoah": "יום השואה",
  "Yom HaZikaron": "יום הזיכרון",
  "Yom HaAtzma'ut": "יום העצמאות",
  "Yom Yerushalayim": "יום ירושלים",
  Purim: "פורים",
  "Tu BiShvat": "ט״ו בשבט",
  "Lag BaOmer": "ל״ג בעומר",
  "Tish'a B'Av": "תשעה באב",
};

function shortNameFor(desc: string, fullName: string): string {
  if (SHORT[desc]) return SHORT[desc];
  if (/^Rosh Hashana \d+$/.test(desc)) return "ראש השנה";
  if (desc.includes("CH''M")) return "חוה״מ";
  return fullName;
}

function classify(ev: Event): Holiday | null {
  const desc = ev.getDesc();
  const f = ev.getFlags();
  const hebrew = ev.render("he-x-NoNikud");

  // חנוכה: hebcal מחזיר "חנוכה: ג׳ נרות" לכל ערב — ארוך מדי לתא בלוח.
  // "1 Candle" הוא הערב שלפני היום הראשון.
  if (desc.startsWith("Chanukah")) {
    const name = desc === "Chanukah: 1 Candle" ? "ערב חנוכה" : "חנוכה";
    return { name, shortName: name, kind: "minor" };
  }

  if (f & flags.CHAG) {
    // "Rosh Hashana 5787" → "ראש השנה א׳". מספר השנה לא שימושי בלוח.
    const name = /^Rosh Hashana \d+$/.test(desc) ? "ראש השנה א׳" : hebrew;
    return { name, shortName: shortNameFor(desc, name), kind: "chag" };
  }
  const tag = (kind: HolidayKind): Holiday => ({ name: hebrew, shortName: shortNameFor(desc, hebrew), kind });
  if (f & flags.CHOL_HAMOED) return tag("cholHamoed");
  if (EREV.has(desc)) return tag("erev");
  if (NATIONAL.has(desc)) return tag("national");
  if (MINOR.has(desc)) return tag("minor");
  return null;
}

function localDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function ymdOf(date: Date): string {
  // greg() בונה Date בחצות לפי השעון המקומי של השרת, ולכן קוראים אותו
  // בגטרים מקומיים — toISOString היה מזיז את היום בשרת שאינו ב-UTC.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** חגים בין שני תאריכים (כולל), לפי לוח ארץ ישראל — יום טוב אחד, לא שניים. */
export function israeliHolidaysBetween(startYmd: string, endYmd: string): HolidayMap {
  const events = HebrewCalendar.calendar({
    start: localDate(startYmd),
    end: localDate(endYmd),
    il: true,
    noMinorFast: true,
    noRoshChodesh: true,
    noSpecialShabbat: true,
  });

  const map: HolidayMap = {};
  for (const ev of events) {
    const holiday = classify(ev);
    if (!holiday) continue;
    const key = ymdOf(ev.getDate().greg());
    (map[key] ??= []).push(holiday);
  }
  return map;
}

/**
 * חלון החגים שמועבר ללוחות: חצי שנה אחורה, שנה וחצי קדימה. מספיק לכל
 * ניווט סביר בתצוגה החודשית (טווח ההזמנה עצמו הוא 30 יום), וזול —
 * כ-80 רשומות, אלפיות שנייה בשרת.
 */
export function holidaysForSchedule(): HolidayMap {
  const today = todayInIsrael();
  return israeliHolidaysBetween(addDaysToDateStr(today, -180), addDaysToDateStr(today, 540));
}

export type { Holiday, HolidayKind, HolidayMap };
