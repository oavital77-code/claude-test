import { describe, expect, it } from "vitest";
import { slotHours } from "./session";

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
