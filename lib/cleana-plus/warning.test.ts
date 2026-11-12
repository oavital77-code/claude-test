import { describe, expect, it } from "vitest";
import { cleanaPlusWarningText } from "./warning";

describe("cleanaPlusWarningText", () => {
  it("says nothing when there is nothing booked", () => {
    expect(cleanaPlusWarningText({ status: "none" }, "therapist")).toBeNull();
    expect(cleanaPlusWarningText({ status: "none" }, "admin")).toBeNull();
  });

  it("names the hours, and tells the therapist what happens", () => {
    const text = cleanaPlusWarningText({ status: "booked", times: ["15:00"] }, "therapist")!;
    expect(text).toContain("15:00");
    expect(text).toContain("אין חדר");
    expect(text).toContain("לא יבוטל");
  });

  it("tells the admin the hours and never who", () => {
    const text = cleanaPlusWarningText({ status: "booked", times: ["15:00", "16:00"] }, "admin")!;
    expect(text).toContain("15:00, 16:00");
    expect(text).toContain("פרטי הלקוחות לא מוצגים");
  });

  it("warns softly when Cleana+ could not be asked", () => {
    expect(cleanaPlusWarningText({ status: "unknown" }, "therapist")).toContain("לא הצלחנו לבדוק");
  });
});
