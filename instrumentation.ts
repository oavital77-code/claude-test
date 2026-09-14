import * as Sentry from "@sentry/nextjs";
import { scrubPii } from "@/lib/sentry/scrub-pii";

export async function register() {
  const options: Sentry.NodeOptions = {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

    // בלי sendDefaultPii — ר' לוגים ב-CLAUDE.md: אף פעם לא PII (ת"ז, טלפון) ולא נתוני כרטיס.
    sendDefaultPii: false,
    beforeSend: scrubPii,

    // מעקב ביצועים כבוי כברירת מחדל — זו מערכת ניטור שגיאות, לא APM.
    tracesSampleRate: 0,
  };

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init(options);
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(options);
  }
}

export const onRequestError = Sentry.captureRequestError;
