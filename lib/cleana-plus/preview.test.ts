import { describe, expect, it } from "vitest";
import { previewSlots } from "./preview";

const at = (hhmm: string) => new Date(`2026-11-17T${hhmm}:00+02:00`);

describe("previewSlots", () => {
  it("shows one slot per whole hour of the room", () => {
    expect(previewSlots(at("14:00"), at("17:00")).map((s) => s.startsAt.toISOString())).toEqual(
      [at("14:00"), at("15:00"), at("16:00")].map((d) => d.toISOString()),
    );
  });

  it("drops the half hour left over, and shows nothing for a room under an hour", () => {
    expect(previewSlots(at("09:00"), at("10:30"))).toHaveLength(1);
    expect(previewSlots(at("09:00"), at("09:30"))).toEqual([]);
  });
});
