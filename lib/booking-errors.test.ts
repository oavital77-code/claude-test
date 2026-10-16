import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bookingErrorMessage } from "./booking-errors";

describe("bookingErrorMessage", () => {
  it("ממפה קוד ידוע להודעה בעברית", () => {
    expect(bookingErrorMessage("SESSION_NOT_CANCELLABLE")).toBe(
      "מפגש ססיה לא ניתן לביטול או לשינוי עצמאי. פנו להנהלה.",
    );
    expect(bookingErrorMessage("NO_CREDIT")).toBe("אין לך יתרת שעות בתוקף. יש לרכוש כרטיסייה.");
  });

  it("קודי שינוי הזמנה (reschedule_booking) מתורגמים", () => {
    expect(bookingErrorMessage("RESCHEDULE_WINDOW_PASSED")).toContain("כבר אי אפשר לשנות");
    expect(bookingErrorMessage("NOT_RESCHEDULABLE")).toContain("רק דרך ההנהלה");
  });

  it("כל קוד ש-reschedule_booking זורק מתורגם לעברית", () => {
    const sql = readFileSync(
      fileURLToPath(new URL("../supabase/migrations/20261016000004_reschedule_booking.sql", import.meta.url)),
      "utf8",
    );
    const codes = [...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(5);
    for (const code of new Set(codes)) {
      expect(bookingErrorMessage(code), code).not.toContain("משהו השתבש");
    }
  });

  it("קוד לא מוכר מחזיר הודעת ברירת מחדל שכוללת את הקוד הגולמי לאבחון", () => {
    expect(bookingErrorMessage("SOME_UNKNOWN_CODE")).toBe("משהו השתבש. נסו שוב. (SOME_UNKNOWN_CODE)");
  });

  it("undefined מחזיר הודעת ברירת מחדל", () => {
    expect(bookingErrorMessage(undefined)).toBe("משהו השתבש. נסו שוב.");
  });
});
