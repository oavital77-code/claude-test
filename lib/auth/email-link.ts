import type { EmailOtpType } from "@supabase/supabase-js";

// קישורי מייל (איפוס סיסמה / אימות הרשמה) — token_hash חד-פעמי.
//
// ⚠️ אסור לנצל את הטוקן ב-GET (פתיחת הקישור). סורקי קישורים של שירותי מייל
// (Outlook Safe Links, סורקי אבטחה ארגוניים) פותחים כל קישור שמגיע — וניצול
// ב-GET נתן להם "לשרוף" את הקוד שתי שניות לפני שהמטפלת לחצה, והיא קיבלה
// "פג תוקף" שוב ושוב (ליל ההשקה 15/10, ר' OPERATIONS.md). לכן: /auth/callback
// רק מעביר לדף /auth/confirm, והניצול קורה ב-POST מכפתור — סורקים לא לוחצים.

const ALLOWED_TYPES = ["recovery", "signup", "email", "invite", "magiclink", "email_change"] as const;

/**
 * מונע open redirect: רק נתיב יחסי בתוך האתר עצמו. בדיקת קידומת לבדה לא
 * מספיקה — ה-URL parser מוחק tab/newline ומתייחס ל-\ כ-/, אז "/\t/evil.com"
 * עבר את הבדיקה ונפתר ל-https://evil.com. לכן: דוחים תווי בקרה ו-backslash,
 * ומוודאים שהנתיב נפתר לאותו origin.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || /[\u0000-\u001F\u007F\\]/.test(raw)) return "/login";
  const base = "https://internal.invalid";
  try {
    const url = new URL(raw, base);
    return url.origin === base ? url.pathname + url.search + url.hash : "/login";
  } catch {
    return "/login";
  }
}

export function parseOtpType(raw: string | null | undefined): EmailOtpType | null {
  return (ALLOWED_TYPES as readonly string[]).includes(raw ?? "") ? (raw as EmailOtpType) : null;
}

/** כתובת דף האישור (עם הכפתור) — לשם /auth/callback מעביר במקום לנצל את הקוד. */
export function confirmPagePath(tokenHash: string, type: EmailOtpType, next: string): string {
  const params = new URLSearchParams({ token_hash: tokenHash, type, next: safeNext(next) });
  return `/auth/confirm?${params.toString()}`;
}

/** טקסט הכפתור לפי סוג הקישור. */
export function confirmButtonLabel(type: EmailOtpType): string {
  return type === "recovery" ? "להמשך — קביעת סיסמה" : "להמשך — אימות החשבון";
}
