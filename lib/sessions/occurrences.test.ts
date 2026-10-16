import { describe, expect, it } from "vitest";
import { MATERIALIZE_HORIZON_DAYS, overlaps, slotOccurrences } from "./occurrences";

const slot = { roomId: "r1", weekday: 2, startTime: "15:00", endTime: "20:00" }; // שלישי

describe("slotOccurrences", () => {
  it("רק הימים התואמים, בטווח", () => {
    const occ = slotOccurrences([slot], "2026-11-01", "2026-11-30", "2026-10-16");
    expect(occ.map((o) => o.date)).toEqual(["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"]);
  });

  it("שעון ישראל, כולל מעבר שעון (27/10/2026 אחרי סוף שעון קיץ)", () => {
    const [before] = slotOccurrences([slot], "2026-10-20", "2026-10-20", "2026-10-16");
    const [after] = slotOccurrences([slot], "2026-10-27", "2026-10-27", "2026-10-16");
    expect(before.startsAt.toISOString()).toBe("2026-10-20T12:00:00.000Z"); // +03:00
    expect(after.startsAt.toISOString()).toBe("2026-10-27T13:00:00.000Z"); // +02:00
    expect(after.endsAt.toISOString()).toBe("2026-10-27T18:00:00.000Z");
  });

  it("בלי תאריך סיום — עד אופק ה-materialize בלבד", () => {
    const occ = slotOccurrences([slot], "2026-10-16", null, "2026-10-16");
    const lastDate = occ[occ.length - 1].date;
    expect(lastDate <= "2027-01-14").toBe(true); // 16/10 + 90 ימים
    expect(occ.length).toBeGreaterThanOrEqual(Math.floor(MATERIALIZE_HORIZON_DAYS / 7));
  });

  it("כמה משבצות", () => {
    const occ = slotOccurrences(
      [slot, { roomId: "r2", weekday: 4, startTime: "09:00", endTime: "10:00" }],
      "2026-11-01",
      "2026-11-07",
      "2026-10-16",
    );
    expect(occ.map((o) => `${o.date}/${o.roomId}`)).toEqual(["2026-11-03/r1", "2026-11-05/r2"]);
  });
});

describe("overlaps", () => {
  const t = (h: number) => new Date(Date.UTC(2026, 10, 3, h));
  it("גבולות נוגעים לא מתנגשים", () => {
    expect(overlaps(t(9), t(10), t(10), t(11))).toBe(false);
  });
  it("חפיפה חלקית מתנגשת", () => {
    expect(overlaps(t(9), t(11), t(10), t(12))).toBe(true);
  });
});
