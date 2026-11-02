import { describe, expect, it } from "vitest";
import { isInProgress, splitBookings } from "./split";

const now = new Date("2026-11-02T14:08:00Z"); // 16:08 שעון ישראל
const b = (id: string, start: string, end: string, status = "confirmed") => ({ id, status, starts_at: start, ends_at: end });

describe("splitBookings", () => {
  const list = [
    b("jan", "2027-01-25T12:00:00Z", "2027-01-25T18:00:00Z"),
    b("today-now", "2026-11-02T12:00:00Z", "2026-11-02T18:00:00Z"), // 14:00–20:00, מתקיים עכשיו
    b("wed", "2026-11-04T07:00:00Z", "2026-11-04T12:00:00Z"),
    b("yesterday", "2026-11-01T15:00:00Z", "2026-11-01T16:00:00Z"),
    b("cancelled-future", "2026-11-09T12:00:00Z", "2026-11-09T14:00:00Z", "cancelled_by_admin"),
  ];
  const { upcoming, history } = splitBookings(list, now);

  it("מפגש שמתקיים עכשיו נשאר ב'קרובות' (חופית 02/11)", () => {
    expect(upcoming.map((x) => x.id)).toContain("today-now");
  });

  it("קרובות: מהקרובה לרחוקה — של היום ראשונה, לא ינואר", () => {
    expect(upcoming.map((x) => x.id)).toEqual(["today-now", "wed", "jan"]);
  });

  it("היסטוריה: שהסתיימו + מבוטלות, מהחדשה לישנה", () => {
    expect(history.map((x) => x.id)).toEqual(["cancelled-future", "yesterday"]);
  });

  it("isInProgress", () => {
    expect(isInProgress(list[1], now)).toBe(true);
    expect(isInProgress(list[2], now)).toBe(false);
    expect(isInProgress(list[3], now)).toBe(false);
  });
});
