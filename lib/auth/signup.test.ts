import { describe, expect, it } from "vitest";
import { isExistingAccountSignup } from "./signup";

describe("isExistingAccountSignup", () => {
  it("מייל רשום ומאומת — identities ריק, לא נשלח מייל", () => {
    expect(isExistingAccountSignup({ identities: [] })).toBe(true);
  });
  it("הרשמה חדשה — יש identity, נשלח מייל אימות", () => {
    expect(isExistingAccountSignup({ identities: [{ provider: "email" }] })).toBe(false);
  });
  it("בלי משתמש / בלי שדה identities — לא מניחים חשבון קיים", () => {
    expect(isExistingAccountSignup(null)).toBe(false);
    expect(isExistingAccountSignup({})).toBe(false);
    expect(isExistingAccountSignup({ identities: null })).toBe(false);
  });
});
