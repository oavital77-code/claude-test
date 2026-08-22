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
