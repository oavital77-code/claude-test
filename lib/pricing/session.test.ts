import { describe, expect, it } from "vitest";
import { computeSessionMonthlyPrice, slotHours } from "./session";

// נוסחה מ-CLAUDE.md: monthlyPrice = 600 + max(0, weeklyHours - 5) * 110
describe("computeSessionMonthlyPrice", () => {
  it.each([
    [1, 600],
    [5, 600],
    [6, 710],
    [8, 930],
    [10, 1150],
])("weeklyHours=%i -> %i", (weeklyHours, expected) => {
    expect(computeSessionMonthlyPrice(weeklyHours, 5, 600, 110)).toBe(expected);
  });

  it("לא יורד מתחת למחיר הבסיס גם כשמבקשים פחות מהמינימום", () => {
    expect(computeSessionMonthlyPrice(0, 5, 600, 110)).toBe(600);
  });
});

describe("slotHours", () => {
  it.each([
    ["09:00", "10:00", 1],
    ["09:00", "10:30", 1.5],
    ["09:00", "09:30", 0.5],
    ["08:00", "08:00", 0],
  ])("%s–%s -> %i שעות", (startTime, endTime, expected) => {
    expect(slotHours({ startTime, endTime })).toBe(expected);
  });
});
