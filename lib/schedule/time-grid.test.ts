import { describe, expect, it } from "vitest";
import { daySlots, israelDateTime, israelHHmm, weekDatesStartingSunday } from "@/lib/availability/grid";
import type { AvailabilityInterval } from "@/lib/availability/types";
import {
  columnBlocks,
  defaultFrame,
  dragTo,
  extendSelection,
  firstFreeFrame,
  place,
  proposeStart,
  resizeTo,
  toInstants,
  toMinutes,
  toSpan,
} from "./time-grid";

const h = (H: number, M = 0) => H * 60 + M;

describe("proposeStart / defaultFrame", () => {
  it("09:00–10:00 ו-10:00–11:00 לא מתנגשים", () => {
    expect(defaultFrame([{ start: h(9), end: h(10) }], h(10, 10))).toEqual({ start: h(10), end: h(11), fits: true });
  });

  it("הקשה בתוך זמן תפוס קופצת לסופו", () => {
    expect(proposeStart([{ start: h(9), end: h(10) }], h(9, 20), 60).start).toBe(h(10));
  });

  it("לחיצה פותחת שעה כברירת מחדל, מעוגלת לחצי השעה שהוקשה", () => {
    expect(defaultFrame([], h(14, 40))).toEqual({ start: h(14, 30), end: h(15, 30), fits: true });
  });

  it("פער של חצי שעה בלבד → מסגרת של חצי שעה (כמו לחיצה בלוח הישן)", () => {
    const items = [
      { start: h(9), end: h(10) },
      { start: h(10, 30), end: h(12) },
    ];
    expect(defaultFrame(items, h(10, 5))).toEqual({ start: h(10), end: h(10, 30), fits: true });
  });

  it("21:30 → חצי שעה עד סוף היום, לא חורג מ-22:00", () => {
    expect(defaultFrame([], h(21, 40))).toEqual({ start: h(21, 30), end: h(22), fits: true });
  });

  it("אין שום מקום → fits=false", () => {
    expect(defaultFrame([{ start: h(9), end: h(22) }], h(9, 10)).fits).toBe(false);
  });

  it("מקלדת: המסגרת הפנויה הראשונה מ-09:00", () => {
    expect(firstFreeFrame([{ start: h(8), end: h(10) }], h(9))).toEqual({ start: h(10), end: h(11), fits: true });
  });
});

describe("גרירה ומתיחה", () => {
  it("גרירה נצמדת לחצי שעה", () => {
    expect(dragTo([], { start: h(10), end: h(11) }, 17)).toEqual({ start: h(10, 30), end: h(11, 30), fits: true });
  });

  it("גרירה חסומה בגבולות 07:00–22:00 ושומרת על האורך", () => {
    expect(dragTo([], { start: h(20), end: h(21, 30) }, 600)).toEqual({ start: h(20, 30), end: h(22), fits: true });
    expect(dragTo([], { start: h(8), end: h(9) }, -600)).toEqual({ start: h(7), end: h(8), fits: true });
  });

  it("גרירה על זמן תפוס → fits=false", () => {
    expect(dragTo([{ start: h(10, 30), end: h(12) }], { start: h(9), end: h(10) }, 60).fits).toBe(false);
  });

  it("מתיחה לא יורדת מחצי שעה ולא חורגת מהיום", () => {
    const s = { start: h(10), end: h(11) };
    expect(resizeTo([], s, "end", -300).end).toBe(h(10, 30));
    expect(resizeTo([], s, "start", 300).start).toBe(h(10, 30));
    expect(resizeTo([], s, "end", 2000).end).toBe(h(22));
    expect(resizeTo([], s, "start", -2000).start).toBe(h(7));
  });

  it("place: 07:00 בראש העמודה, שעה = hourHeight", () => {
    expect(place(h(7), h(8), 48)).toEqual({ top: 0, height: 48 });
    expect(place(h(9, 30), h(10), 48)).toEqual({ top: 120, height: 24 });
  });
});

describe("הרחבה בלחיצה נוספת (התנהגות הלוח הישן)", () => {
  it("איחוד פנוי → מורחב", () => {
    expect(extendSelection([], { start: h(10), end: h(11) }, { start: h(13), end: h(13, 30) })).toEqual({
      start: h(10),
      end: h(13, 30),
    });
  });
  it("יש תפוס באמצע → null (בחירה חדשה)", () => {
    expect(
      extendSelection([{ start: h(12), end: h(12, 30) }], { start: h(10), end: h(11) }, { start: h(13), end: h(13, 30) }),
    ).toBeNull();
  });
});

/**
 * השקילות שהובטחה: הלוח החדש שולח ל-bookSlot בדיוק אותם רגעים שהלוח הישן
 * היה שולח לאותה בחירה — כולל יום מעבר שעון (25/10/2026, סוף שעון קיץ).
 */
describe("שקילות ללוח הישן (resolveSlot)", () => {
  // resolveSlot הישן, מועתק כמו שהוא מ-schedule-client.tsx
  function oldResolve(view: "day" | "week", columnKey: string, slot: { start: Date; end: Date }) {
    if (view === "day") return { start: slot.start, end: slot.end };
    return {
      start: israelDateTime(columnKey, israelHHmm(slot.start)),
      end: israelDateTime(columnKey, israelHHmm(slot.end)),
    };
  }

  for (const date of ["2026-10-25", "2026-03-27", "2026-11-15"]) {
    it(`תצוגת יום ${date}: כל 30 המשבצות זהות`, () => {
      for (const slot of daySlots(date)) {
        const old = oldResolve("day", date, slot);
        const m = toMinutes(israelHHmm(slot.start));
        const next = toInstants(date, { start: m, end: m + 30 });
        expect(next.start.toISOString()).toBe(old.start.toISOString());
        expect(next.end.toISOString()).toBe(old.end.toISOString());
      }
    });

    it(`תצוגת שבוע סביב ${date}: כל יום וכל משבצת זהים`, () => {
      const week = weekDatesStartingSunday(date);
      const anchorSlots = daySlots(week[0]);
      for (const day of week) {
        for (const slot of anchorSlots) {
          const old = oldResolve("week", day, slot);
          const m = toMinutes(israelHHmm(slot.start));
          const next = toInstants(day, { start: m, end: m + 30 });
          expect(next.start.toISOString()).toBe(old.start.toISOString());
          expect(next.end.toISOString()).toBe(old.end.toISOString());
        }
      }
    });
  }

  it("טווח מורחב (09:00–12:30) ביום מעבר שעון = איחוד המשבצות הישנות", () => {
    const date = "2026-10-25";
    const slots = daySlots(date).filter((s) => israelHHmm(s.start) >= "09:00" && israelHHmm(s.end) <= "12:30");
    const next = toInstants(date, { start: h(9), end: h(12, 30) });
    expect(next.start.toISOString()).toBe(slots[0].start.toISOString());
    expect(next.end.toISOString()).toBe(slots[slots.length - 1].end.toISOString());
  });
});

describe("columnBlocks — חוק ברזל #3", () => {
  const d = "2026-11-15";
  const iv = (from: string, to: string, status: AvailabilityInterval["status"], source?: "session" | "punch_card") => ({
    startsAt: israelDateTime(d, from),
    endsAt: israelDateTime(d, to),
    status,
    source,
  });

  it("הזמנות של אחרים + חסימות סמוכות/חופפות מתמזגות לבלוק אחד", () => {
    const b = columnBlocks(d, [iv("09:00", "10:00", "taken"), iv("10:00", "11:00", "taken"), iv("10:30", "12:00", "blocked")]);
    expect(b.unavailable).toEqual([{ start: h(9), end: h(12) }]);
  });

  it("ההזמנה שלי נשארת נפרדת עם המקור", () => {
    const b = columnBlocks(d, [iv("13:00", "14:00", "mine", "session"), iv("14:00", "15:00", "taken")]);
    expect(b.mine).toHaveLength(1);
    expect(b.mine[0]).toMatchObject({ start: h(13), end: h(14), source: "session" });
    expect(b.unavailable).toEqual([{ start: h(14), end: h(15) }]);
    expect(b.busy).toHaveLength(2);
  });

  it("נחתך לטווח 07:00–22:00 ומתעלם מיום אחר", () => {
    const b = columnBlocks(d, [
      { startsAt: israelDateTime(d, "05:00"), endsAt: israelDateTime(d, "08:00"), status: "taken" },
      { startsAt: israelDateTime(d, "21:00"), endsAt: israelDateTime("2026-11-16", "01:00"), status: "taken" },
      { startsAt: israelDateTime("2026-11-16", "09:00"), endsAt: israelDateTime("2026-11-16", "10:00"), status: "taken" },
    ]);
    expect(b.unavailable).toEqual([
      { start: h(7), end: h(8) },
      { start: h(21), end: h(22) },
    ]);
  });

  it("toSpan ביום מעבר שעון: 13:00 נשאר 13:00", () => {
    const date = "2026-10-25";
    expect(toSpan(date, israelDateTime(date, "13:00"), israelDateTime(date, "14:30"))).toEqual({
      start: h(13),
      end: h(14, 30),
    });
  });
});
