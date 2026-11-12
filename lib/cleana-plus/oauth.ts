import { randomBytes } from "node:crypto";
import { hasTokenKey, safeEqual } from "./crypto";

// חיבור חשבון Cleana+ (שלב 1 באפיון הסנכרון). זרימה בסגנון OAuth
// (authorization code), מול נתיבים ב-Cleana+ (מאגר click-na,
// src/lib/cleana-link.ts):
//
//   1. /api/cleana-plus/connect — מייצר state אקראי, שומר אותו בעוגייה
//      httpOnly קשורה למשתמש/ת המחובר/ת, ומפנה ל-<CLEANA_PLUS_URL>/connect/cleana.
//   2. המטפל/ת מאשר/ת ב-Cleana+. Cleana+ מחזירה את הדפדפן לכתובת החזרה
//      הקבועה שלה (שלנו: /api/cleana-plus/callback) עם code חד-פעמי + state.
//   3. /api/cleana-plus/callback — מאמת state מול העוגייה ומול המשתמש/ת,
//      ומחליף את ה-code במפתח אישי, שרת-לשרת, עם CLEANA_PLUS_CLIENT_SECRET.
//      המפתח לא עובר בדפדפן ולא ב-URL. נשמר מוצפן ב-cleana_plus_connections.
//
// כשל ב-Cleana+ לעולם לא נוגע בשום זרימה של Cleana — כל הקריאות כאן עם
// timeout, ותוצאה שלילית מוחזרת כערך, לא נזרקת.

export const STATE_COOKIE = "cleana_plus_state";
export const STATE_TTL_SECONDS = 10 * 60;
const TIMEOUT_MS = 8000;

export type CleanaPlusConfig = { baseUrl: string; clientSecret: string };

/**
 * סביבת בדיקה בלבד: ה-preview של Cleana+ מוגן ב-Vercel Authentication, וקריאה
 * שרת-לשרת נחסמת שם לפני שהיא מגיעה לקוד. Vercel מאפשרת לעבור עם סוד
 * "Protection Bypass for Automation". מוגדר רק ב-preview; בפרודקשן ריק.
 */
function bypassHeaders(): Record<string, string> {
  const secret = process.env.CLEANA_PLUS_PROTECTION_BYPASS;
  return secret ? { "x-vercel-protection-bypass": secret } : {};
}

export function cleanaPlusConfig(): CleanaPlusConfig | null {
  const raw = process.env.CLEANA_PLUS_URL;
  const clientSecret = process.env.CLEANA_PLUS_CLIENT_SECRET;
  if (!raw || !clientSecret || !hasTokenKey()) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return { baseUrl: url.origin, clientSecret };
  } catch {
    return null;
  }
}

export function newState(): string {
  return randomBytes(24).toString("base64url");
}

/** ערך העוגייה: state + מזהה המשתמש/ת שהתחיל/ה את החיבור. */
export function stateCookieValue(state: string, userId: string): string {
  return `${state}.${userId}`;
}

/**
 * ה-state שחזר מ-Cleana+ תואם לעוגייה, והחיבור הסתיים אצל אותו/ה משתמש/ת
 * שהתחיל/ה אותו. בלי זה אפשר היה "לשתול" אצל מטפל/ת חשבון Cleana+ של מישהו אחר.
 */
export function stateMatches(cookie: string | undefined, state: string | null, userId: string): boolean {
  if (!cookie || !state) return false;
  return safeEqual(cookie, stateCookieValue(state, userId));
}

export function authorizeUrl(config: CleanaPlusConfig, state: string): string {
  const url = new URL("/connect/cleana", config.baseUrl);
  url.searchParams.set("state", state);
  return url.toString();
}

export type ExchangeResult =
  | { ok: true; accessToken: string; accountLabel: string | null }
  | { ok: false; reason: "rejected" | "unavailable" };

export async function exchangeCode(config: CleanaPlusConfig, code: string): Promise<ExchangeResult> {
  try {
    const res = await fetch(new URL("/api/integrations/cleana/token", config.baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.clientSecret}`,
        "content-type": "application/json",
        ...bypassHeaders(),
      },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status >= 500) return { ok: false, reason: "unavailable" };
    if (!res.ok) return { ok: false, reason: "rejected" };
    const body = (await res.json()) as { access_token?: unknown; account_label?: unknown };
    if (typeof body.access_token !== "string" || !body.access_token.startsWith("clp_")) {
      return { ok: false, reason: "rejected" };
    }
    return {
      ok: true,
      accessToken: body.access_token,
      accountLabel: typeof body.account_label === "string" ? body.account_label.slice(0, 255) : null,
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** ניתוק מצד Cleana. best-effort: גם אם Cleana+ לא עונה, המפתח נמחק אצלנו. */
export async function revokeToken(config: CleanaPlusConfig, accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(new URL("/api/integrations/cleana/revoke", config.baseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, ...bypassHeaders() },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

const CODE_PATTERN = /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{32,128}$/i;
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function validCode(code: string | null): code is string {
  return !!code && CODE_PATTERN.test(code);
}

export function validState(state: string | null): state is string {
  return !!state && STATE_PATTERN.test(state);
}
