import type { ErrorEvent } from "@sentry/nextjs";

// חוק ברזל ב-CLAUDE.md: לוגים אף פעם לא PII (ת"ז, טלפון) ולא נתוני כרטיס.
// Sentry מסנן בעצמו שדות כמו password/authorization, אבל לא מכיר את השדות
// הספציפיים של המערכת הזו (teudat_zehut, phone) — אז מסננים אותם ידנית בכל
// מקום שהם עלולים להופיע: request data, query string, cookies, extra, contexts.
const REDACTED_KEY_PATTERN = /teudat.?zehut|phone|card|cvv|deposit_amount|token_hash/i;

function redactDeep(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = REDACTED_KEY_PATTERN.test(key) ? "[Filtered]" : redactDeep(val, seen);
  }
  return result;
}

export function scrubPii(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = redactDeep(event.request) as typeof event.request;
  }
  if (event.extra) {
    event.extra = redactDeep(event.extra) as typeof event.extra;
  }
  if (event.contexts) {
    event.contexts = redactDeep(event.contexts) as typeof event.contexts;
  }
  if (event.user) {
    // אין צורך בזהות מלאה של המשתמש כדי לחקור שגיאה — משאירים רק מזהה טכני.
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }
  return event;
}
