import { describe, expect, it } from "vitest";
import {
  addDaysToDateStr,
  addMonthsToDateStr,
  monthCalendarDates,
  startOfMonth,
  weekDatesStartingSunday,
} from "./grid";

// באג אמיתי שנתפס: date-fns parseISO/addDays פועלים בזמן מקומי, ותערובת עם
// formatInTimeZone(..., "UTC", ...) גרמה ל"יום הבא" לחזור לאותו תאריך בדיוק
// באזורי זמן קדימה מ-UTC (ישראל). הבדיקה כאן לא תלויה בכלל באזור הזמן של
// המכונה שמריצה אותה — היא בודקת רק את תוצאת מחרוזת התאריך.
describe("addDaysToDateStr", () => {
  it("מתקדם יום אחד קדימה", () => {
    expect(addDaysToDateStr("2026-08-21", 1)).toBe("2026-08-22");
  });

  it("חוזר יום אחד אחורה", () => {
    expect(addDaysToDateStr("2026-08-21", -1)).toBe("2026-08-20");
  });

  it("חוצה גבול חודש", () => {
    expect(addDaysToDateStr("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("חוצה גבול שנה", () => {
    expect(addDaysToDateStr("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("שבוע קדימה", () => {
    expect(addDaysToDateStr("2026-08-21", 7)).toBe("2026-08-28");
  });
});

describe("weekDatesStartingSunday", () => {
  it("מחזיר 7 ימים שמתחילים בראשון, כולל התאריך הנתון", () => {
    // 2026-08-21 הוא יום שישי
    const week = weekDatesStartingSunday("2026-08-21");
    expect(week).toEqual([
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
    ]);
  });

  it("כשהתאריך הנתון הוא כבר יום ראשון, הוא נשאר הראשון ברשימה", () => {
    const week = weekDatesStartingSunday("2026-08-16");
    expect(week[0]).toBe("2026-08-16");
    expect(week).toHaveLength(7);
  });
});

describe("startOfMonth", () => {
  it("מחזיר את ה-1 לחודש", () => {
    expect(startOfMonth("2026-08-21")).toBe("2026-08-01");
  });
});

describe("addMonthsToDateStr", () => {
  it("חודש קדימה", () => {
    expect(addMonthsToDateStr("2026-08-21", 1)).toBe("2026-09-21");
  });

  it("חודש אחורה", () => {
    expect(addMonthsToDateStr("2026-08-21", -1)).toBe("2026-07-21");
  });

  it("מכווץ יום שלא קיים בחודש היעד (31 בינואר -> פברואר לא-מעוברת)", () => {
    expect(addMonthsToDateStr("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("monthCalendarDates", () => {
  it("מחזיר 42 תאריכים (6 שבועות), מתחיל ביום ראשון שמכיל את ה-1 לחודש", () => {
    // 2026-08-01 הוא יום שבת -> יום ראשון הקודם הוא 2026-07-26
    const dates = monthCalendarDates("2026-08-21");
    expect(dates).toHaveLength(42);
    expect(dates[0]).toBe("2026-07-26");
    expect(dates).toContain("2026-08-01");
    expect(dates).toContain("2026-08-31");
  });
});

// ═══ מעבר שעון — באג אמיתי מ-15/10/2026: בלוח, 13:00–16:00 ב-25/10 נשמר
// כ-12:00–15:00 ("חצות + 13 שעות" ביום בן 25 שעות). כל בניית זמן חייבת לעבור
// דרך israelDateTime. הבדיקות לא תלויות באזור הזמן של המכונה. ═══
import { daySlots, israelDateTime, israelHHmm, weekDatesStartingSunday as weekDates } from "./grid";

const DST_END = "2026-10-25"; // סוף שעון קיץ: 02:00 → 01:00 (יום של 25 שעות)
const DST_START = "2027-03-26"; // תחילת שעון קיץ: 02:00 → 03:00 (יום של 23 שעות)

describe("israelDateTime — שעון ישראל בכל יום, כולל ימי מעבר שעון", () => {
  const cases: [string, string, string][] = [
    // [תאריך, שעה מקומית, UTC צפוי]
    ["2026-10-24", "13:00", "2026-10-24T10:00:00.000Z"], // קיץ, UTC+3
    [DST_END, "00:30", "2026-10-24T21:30:00.000Z"], // לפני המעבר, עדיין UTC+3
    [DST_END, "09:00", "2026-10-25T07:00:00.000Z"], // אחרי המעבר, UTC+2
    [DST_END, "13:00", "2026-10-25T11:00:00.000Z"], // המקרה של הבאג
    [DST_END, "16:00", "2026-10-25T14:00:00.000Z"],
    ["2026-10-26", "13:00", "2026-10-26T11:00:00.000Z"], // חורף
    ["2027-03-25", "13:00", "2027-03-25T11:00:00.000Z"], // חורף
    [DST_START, "09:00", "2027-03-26T06:00:00.000Z"], // אחרי המעבר, UTC+3
    [DST_START, "13:00", "2027-03-26T10:00:00.000Z"],
    ["2027-03-27", "13:00", "2027-03-27T10:00:00.000Z"], // קיץ
  ];
  for (const [date, hhmm, iso] of cases) {
    it(`${date} ${hhmm} → ${iso}`, () => {
      expect(israelDateTime(date, hhmm).toISOString()).toBe(iso);
    });
  }

  it("הלוך-חזור: השעה המקומית נשמרת בכל שעה ביום מעבר השעון", () => {
    for (const date of [DST_END, DST_START, "2026-10-26", "2026-08-01"]) {
      for (let h = 7; h <= 22; h++) {
        for (const m of ["00", "30"]) {
          const hhmm = `${String(h).padStart(2, "0")}:${m}`;
          expect(israelHHmm(israelDateTime(date, hhmm))).toBe(hhmm);
        }
      }
    }
  });

  it("13:00–16:00 ביום מעבר השעון = בדיוק 3 שעות", () => {
    for (const date of [DST_END, DST_START]) {
      const ms = israelDateTime(date, "16:00").getTime() - israelDateTime(date, "13:00").getTime();
      expect(ms).toBe(3 * 60 * 60 * 1000);
    }
  });
});

describe("daySlots — שורות הלוח מתחילות ב-07:00 מקומי גם ביום מעבר שעון", () => {
  for (const date of [DST_END, DST_START, "2026-10-26", "2026-08-01"]) {
    it(date, () => {
      const slots = daySlots(date);
      expect(israelHHmm(slots[0].start)).toBe("07:00");
      expect(israelHHmm(slots[12].start)).toBe("13:00");
      expect(israelHHmm(slots[slots.length - 1].end)).toBe("22:00");
    });
  }
});

describe("תצוגה שבועית — השעה בכל יום בשבוע של מעבר השעון", () => {
  // כך הלוח (אדמין + מטפלים) ממיר שורה בתבנית לתא ביום מסוים: לפי השעה המקומית.
  it("שורת 13:00 נשארת 13:00 בכל 7 הימים", () => {
    const template = daySlots(weekDates(DST_END)[0]);
    const row13 = template.find((s) => israelHHmm(s.start) === "13:00")!;
    for (const d of weekDates(DST_END)) {
      expect(israelHHmm(israelDateTime(d, israelHHmm(row13.start)))).toBe("13:00");
    }
  });
});
