import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth-errors";

// השגיאה האמיתית מהלוגים של 11/10: איפוס סיסמה עם סיסמה שדלפה, שהוצג
// למשתמש כ"ייתכן שהקישור פג תוקף" — הודעה שגויה ששלחה לחפש בעיה במקום אחר.
const WEAK = { code: "weak_password", message: "Password is known to be weak and easy to guess, please choose a different one." };

describe("authErrorMessage", () => {
  it("סיסמה שדלפה/חלשה — אומר זאת במפורש, לא 'הקישור פג תוקף'", () => {
    const msg = authErrorMessage(WEAK, "reset");
    expect(msg).toMatch(/סיסמה/);
    expect(msg).toMatch(/דלפה|נפוצה/);
    expect(msg).not.toMatch(/פג תוקף/);
  });

  it("אותה הודעה גם בהרשמה — ובעברית, לא הטקסט האנגלי של Supabase", () => {
    const msg = authErrorMessage(WEAK, "signup");
    expect(msg).not.toMatch(/[a-z]{4,}/i);
    expect(msg).toMatch(/דלפה|נפוצה/);
  });

  it("זיהוי גם לפי טקסט כשאין code (גרסאות ישנות של השרת)", () => {
    expect(authErrorMessage({ message: WEAK.message }, "reset")).toBe(authErrorMessage(WEAK, "reset"));
  });

  it("סיסמה זהה לקודמת", () => {
    expect(authErrorMessage({ code: "same_password", message: "x" }, "reset")).toMatch(/זהה לקודמת/);
  });

  it("סשן שפג/לא קיים — רק אז 'הקישור פג תוקף'", () => {
    for (const code of ["session_not_found", "session_expired", "reauthentication_needed"]) {
      expect(authErrorMessage({ code, message: "x" }, "reset")).toMatch(/פג תוקף/);
    }
  });

  it("מייל קיים בהרשמה", () => {
    for (const code of ["user_already_exists", "email_exists"]) {
      expect(authErrorMessage({ code, message: "x" }, "signup")).toMatch(/כבר בשימוש/);
    }
  });

  it("חסימת קצב — מבקש להמתין", () => {
    expect(authErrorMessage({ code: "over_request_rate_limit", message: "x" }, "signup")).toMatch(/להמתין|נסו שוב/);
  });

  it("שגיאה לא מוכרת — הודעה כללית בעברית, בלי הטקסט הגולמי", () => {
    const msg = authErrorMessage({ code: "something_new", message: "Internal weird thing" }, "signup");
    expect(msg).not.toMatch(/Internal/);
    expect(msg).toMatch(/נסו שוב/);
  });
});
