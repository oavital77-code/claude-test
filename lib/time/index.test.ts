import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import {
  accessWindow,
  formatDateHe,
  formatDateTimeHe,
  formatTimeHe,
  isAlignedTo30Minutes,
  isoDaysAgo,
  TIMEZONE,
} from "./index";

// עוזר לבדיקות: בונה instant מדויק משעון קיר בישראל, כדי לא להיות תלוי
// באזור הזמן של המכונה שמריצה את הבדיקות.
function jerusalem(wallClock: string): Date {
  return fromZonedTime(wallClock, TIMEZONE);
}

describe("accessWindow", () => {
  it("מזיז את שעות הכניסה/פינוי 5 דקות אחורה בלי לגעת בשעות המקוריות", () => {
    const startsAt = jerusalem("2026-06-01 09:00:00");
    const endsAt = jerusalem("2026-06-01 10:00:00");
    const { accessStart, accessEnd } = accessWindow(startsAt, endsAt);

    expect(accessStart.getTime()).toBe(startsAt.getTime() - 5 * 60_000);
    expect(accessEnd.getTime()).toBe(endsAt.getTime() - 5 * 60_000);
    // המקור לא מוחלף
    expect(startsAt.getTime()).toBe(jerusalem("2026-06-01 09:00:00").getTime());
  });
});

describe("isAlignedTo30Minutes", () => {
  it.each([
    ["09:00:00", true],
    ["09:30:00", true],
    ["23:30:00", true],
    ["00:00:00", true],
    ["09:15:00", false],
    ["09:01:00", false],
    ["09:00:01", false],
    ["09:45:00", false],
  ])("בחורף (בלי שעון קיץ): %s -> %s", (time, expected) => {
    expect(isAlignedTo30Minutes(jerusalem(`2026-01-15 ${time}`))).toBe(expected);
  });

  it.each([
    ["09:00:00", true],
    ["09:30:00", true],
    ["09:15:00", false],
  ])("בקיץ (עם שעון קיץ): %s -> %s", (time, expected) => {
    expect(isAlignedTo30Minutes(jerusalem(`2026-07-15 ${time}`))).toBe(expected);
  });
});

describe("formatting", () => {
  const instant = jerusalem("2026-03-05 14:07:00");

  it("formatDateHe: dd/MM/yyyy", () => {
    expect(formatDateHe(instant)).toBe("05/03/2026");
  });

  it("formatTimeHe: HH:mm שעון 24", () => {
    expect(formatTimeHe(instant)).toBe("14:07");
  });

  it("formatDateTimeHe: משלב בין השניים", () => {
    expect(formatDateTimeHe(instant)).toBe("05/03/2026 14:07");
  });
});

describe("isoDaysAgo", () => {
  it("מחזיר ISO string שרחוק בערך X ימים מעכשיו", () => {
    const before = Date.now();
    const iso = isoDaysAgo(3);
    const after = Date.now();

    const parsed = new Date(iso).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before - 3 * 86_400_000 - 1000);
    expect(parsed).toBeLessThanOrEqual(after - 3 * 86_400_000 + 1000);
  });

  it("0 ימים אחורה שקול לעכשיו", () => {
    const iso = isoDaysAgo(0);
    expect(Math.abs(new Date(iso).getTime() - Date.now())).toBeLessThan(1000);
  });
});
