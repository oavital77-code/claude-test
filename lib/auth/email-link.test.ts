import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { confirmButtonLabel, confirmPagePath, parseOtpType, safeNext } from "./email-link";

const repoFile = (rel: string) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

describe("safeNext", () => {
  it("מקבל נתיב יחסי", () => {
    expect(safeNext("/reset-password")).toBe("/reset-password");
  });
  it.each([null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "reset-password"])(
    "דוחה %s → /login",
    (raw) => {
      expect(safeNext(raw)).toBe("/login");
    },
  );
});

describe("parseOtpType", () => {
  it("מקבל recovery/signup", () => {
    expect(parseOtpType("recovery")).toBe("recovery");
    expect(parseOtpType("signup")).toBe("signup");
  });
  it("דוחה ערך לא מוכר", () => {
    expect(parseOtpType("admin")).toBeNull();
    expect(parseOtpType(null)).toBeNull();
  });
});

describe("confirmPagePath", () => {
  it("מעביר את הקוד לדף האישור בלי לנצל אותו", () => {
    const path = confirmPagePath("abc123", "recovery", "/reset-password");
    const url = new URL(path, "https://cleana.co.il");
    expect(url.pathname).toBe("/auth/confirm");
    expect(url.searchParams.get("token_hash")).toBe("abc123");
    expect(url.searchParams.get("type")).toBe("recovery");
    expect(url.searchParams.get("next")).toBe("/reset-password");
  });
  it("לא מעביר next חיצוני", () => {
    const url = new URL(confirmPagePath("x", "signup", "//evil.com"), "https://cleana.co.il");
    expect(url.searchParams.get("next")).toBe("/login");
  });
});

describe("confirmButtonLabel", () => {
  it("טקסט לפי סוג", () => {
    expect(confirmButtonLabel("recovery")).toContain("סיסמה");
    expect(confirmButtonLabel("signup")).toContain("אימות");
  });
});

// שמירה מפני רגרסיה: קישור מייל אסור שינוצל ב-GET — סורקי קישורים "שורפים"
// אותו לפני שהמשתמש לוחץ (ליל ההשקה 15/10). הניצול רק ב-server action.
describe("guard: אין ניצול קוד מייל ב-GET", () => {
  it("/auth/callback לא קורא ל-verifyOtp", () => {
    expect(repoFile("app/auth/callback/route.ts")).not.toMatch(/verifyOtp/);
  });
  it("הניצול נמצא ב-server action של /auth/confirm", () => {
    const action = repoFile("app/auth/confirm/actions.ts");
    expect(action).toMatch(/"use server"/);
    expect(action).toMatch(/verifyOtp/);
  });
  it("דף האישור לא מנצל את הקוד בטעינה", () => {
    expect(repoFile("app/auth/confirm/page.tsx")).not.toMatch(/verifyOtp/);
  });
});
