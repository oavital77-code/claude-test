import { describe, expect, it } from "vitest";
import { holidaysForSchedule, israeliHolidaysBetween } from "./holidays";
import { addDaysToDateStr, todayInIsrael } from "./availability/grid";

// שנה מלאה של חגים — תשפ״ז (ספטמבר 2026 – ספטמבר 2027).
const year = israeliHolidaysBetween("2026-09-01", "2027-09-30");
const on = (d: string) => year[d] ?? [];

describe("israeliHolidaysBetween — ימים טובים", () => {
  it.each([
    ["2026-09-12", "ראש השנה א׳"],
    ["2026-09-13", "ראש השנה ב׳"],
    ["2026-09-21", "יום כיפור"],
    ["2026-09-26", "סוכות א׳"],
    ["2026-10-03", "שמיני עצרת"],
    ["2027-04-22", "פסח א׳"],
    ["2027-04-28", "פסח ז׳"],
    ["2027-06-11", "שבועות"],
  ])("%s → %s (chag)", (date, name) => {
    expect(on(date)).toMatchObject([{ name, kind: "chag" }]);
  });

  it("ראש השנה בלי מספר השנה העברית (״ראש השנה 5787״ לא שימושי בלוח קליניקה)", () => {
    expect(on("2026-09-12")[0].name).not.toMatch(/\d/);
  });
});

describe("לוח ישראלי, לא חו״ל", () => {
  it("פסח ב׳ הוא חול המועד, לא יום טוב שני של גלויות", () => {
    expect(on("2027-04-23")).toMatchObject([{ name: "פסח ב׳ (חוה״מ)", kind: "cholHamoed" }]);
  });

  it("שבועות יום אחד בלבד", () => {
    expect(on("2027-06-12")).toEqual([]);
  });
});

describe("ערבי חג, חול המועד ומועדים", () => {
  it.each([
    ["2026-09-11", "ערב ראש השנה", "erev"],
    ["2026-09-20", "ערב יום כיפור", "erev"],
    ["2027-04-21", "ערב פסח", "erev"],
    ["2026-09-28", "סוכות ג׳ (חוה״מ)", "cholHamoed"],
    ["2026-10-02", "סוכות ז׳ (הושענא רבה)", "cholHamoed"],
    ["2027-05-04", "יום השואה", "national"],
    ["2027-05-11", "יום הזכרון", "national"],
    ["2027-05-12", "יום העצמאות", "national"],
    ["2027-06-04", "יום ירושלים", "national"],
    ["2027-03-23", "פורים", "minor"],
    ["2027-01-23", "ט״ו בשבט", "minor"],
    ["2027-05-25", "ל״ג בעומר", "minor"],
    ["2027-08-12", "תשעה באב", "minor"],
  ])("%s → %s (%s)", (date, name, kind) => {
    expect(on(date)).toMatchObject([{ name, kind }]);
  });

  it("חנוכה מוצג כ״חנוכה״ בכל שמונת הימים, והערב שלפני כ״ערב חנוכה״", () => {
    expect(on("2026-12-04")).toMatchObject([{ name: "ערב חנוכה", kind: "minor" }]);
    for (const d of ["2026-12-05", "2026-12-08", "2026-12-12"]) {
      expect(on(d)).toMatchObject([{ name: "חנוכה", kind: "minor" }]);
    }
  });
});

describe("סינון רעש — מועדים שלא רלוונטיים ללוח קליניקה", () => {
  it.each([
    ["2026-09-05", "סליחות"],
    ["2026-11-09", "חג הסיגד"],
    ["2026-11-16", "יום בן־גוריון"],
    ["2026-12-10", "חג הבנות — רק חנוכה נשאר"],
    ["2027-02-21", "פורים קטן"],
    ["2027-03-24", "שושן פורים (ירושלים בלבד)"],
    ["2027-05-21", "פסח שני"],
    ["2027-08-18", "ט״ו באב"],
    ["2027-09-03", "ראש השנה למעשר בהמה"],
  ])("%s (%s) מסונן", (date) => {
    const names = on(date).map((h) => h.name);
    expect(names.filter((n) => n !== "חנוכה")).toEqual([]);
  });

  it("ערב פורים וערב תשעה באב לא מסומנים כ״ערב חג״", () => {
    expect(on("2027-03-22")).toEqual([]);
    expect(on("2027-08-11")).toEqual([]);
  });
});

describe("גבולות הטווח", () => {
  it("כולל את שני הקצוות ולא מחוץ להם", () => {
    const narrow = israeliHolidaysBetween("2026-09-21", "2026-09-26");
    expect(Object.keys(narrow).sort()).toEqual(["2026-09-21", "2026-09-25", "2026-09-26"]);
  });
});

describe("holidaysForSchedule — החלון שהלוחות מקבלים", () => {
  it("מכסה חצי שנה אחורה ושנה וחצי קדימה, ולא מעבר", () => {
    const map = holidaysForSchedule();
    const keys = Object.keys(map).sort();
    const today = todayInIsrael();
    expect(keys.length).toBeGreaterThan(40);
    expect(keys[0] >= addDaysToDateStr(today, -180)).toBe(true);
    expect(keys[keys.length - 1] <= addDaysToDateStr(today, 540)).toBe(true);
  });

  it("כולל לפחות יום טוב אחד קדימה (תמיד יש חג בשנה וחצי הקרובות)", () => {
    const today = todayInIsrael();
    const upcoming = Object.entries(holidaysForSchedule()).filter(
      ([d, list]) => d >= today && list.some((h) => h.kind === "chag"),
    );
    expect(upcoming.length).toBeGreaterThan(0);
  });
});

describe("shortName — לתאים צרים בתצוגה החודשית", () => {
  it.each([
    ["2026-09-11", "ערב ר״ה"],
    ["2026-09-12", "ראש השנה"],
    ["2026-09-13", "ראש השנה ב׳"],
    ["2026-09-21", "יום כיפור"],
    ["2026-09-26", "סוכות"],
    ["2026-10-02", "הושענא רבה"],
    ["2026-10-03", "שמחת תורה"],
    ["2027-04-22", "פסח"],
    ["2027-04-28", "שביעי של פסח"],
    ["2027-05-11", "יום הזיכרון"],
  ])("%s → %s", (date, short) => {
    expect(on(date)[0].shortName).toBe(short);
  });

  it("כל ימי חול המועד — ״חוה״מ״ בלבד, בלי אות סידורית", () => {
    for (const d of ["2026-09-27", "2026-09-28", "2026-09-30", "2027-04-23", "2027-04-26"]) {
      expect(on(d)[0].shortName).toBe("חוה״מ");
    }
  });

  it("אף שם קצר לא חורג מ-13 תווים (רוחב תא בטלפון)", () => {
    for (const list of Object.values(year)) for (const h of list) expect(h.shortName.length).toBeLessThanOrEqual(13);
  });
});
