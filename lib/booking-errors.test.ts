import { describe, expect, it } from "vitest";
import { bookingErrorMessage } from "./booking-errors";

describe("bookingErrorMessage", () => {
  it("ממפה קוד ידוע להודעה בעברית", () => {
    expect(bookingErrorMessage("SESSION_NOT_CANCELLABLE")).toBe(
      "מפגש ססיה לא ניתן לביטול עצמאי. לביטול פנו להנהלה.",
    );
    expect(bookingErrorMessage("NO_CREDIT")).toBe("אין לך יתרת שעות בתוקף. יש לרכוש כרטיסייה.");
  });

  it("קוד לא מוכר מחזיר הודעת ברירת מחדל", () => {
    expect(bookingErrorMessage("SOME_UNKNOWN_CODE")).toBe("משהו השתבש. נסו שוב.");
  });

  it("undefined מחזיר הודעת ברירת מחדל", () => {
    expect(bookingErrorMessage(undefined)).toBe("משהו השתבש. נסו שוב.");
  });
});
