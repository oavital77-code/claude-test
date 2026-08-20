import { describe, expect, it } from "vitest";
import { formatIsraeliPhoneDisplay, toE164Israel } from "./phone";

describe("toE164Israel", () => {
  it.each([
    ["0501234567", "+972501234567"],
    ["501234567", "+972501234567"],
    ["+972501234567", "+972501234567"],
    ["972501234567", "+972501234567"],
    ["050-123-4567", "+972501234567"],
    ["050 123 4567", "+972501234567"],
  ])("%s -> %s", (input, expected) => {
    expect(toE164Israel(input)).toBe(expected);
  });

  it.each([
    ["0212345678", null], // לא מספר סלולרי (לא מתחיל ב-5 אחרי הקידומת)
    ["05012345", null], // קצר מדי
    ["050123456789", null], // ארוך מדי
    ["", null],
    ["abc", null],
  ])("%s -> %s (לא תקין)", (input, expected) => {
    expect(toE164Israel(input)).toBe(expected);
  });
});

describe("formatIsraeliPhoneDisplay", () => {
  it("מפרק E.164 תקין לתצוגה עם מקף", () => {
    expect(formatIsraeliPhoneDisplay("+972501234567")).toBe("050-1234567");
  });

  it("מחזיר כמו שהוא אם זה לא E.164 ישראלי תקין", () => {
    expect(formatIsraeliPhoneDisplay("+1234567890")).toBe("+1234567890");
  });
});
