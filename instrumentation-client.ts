import * as Sentry from "@sentry/nextjs";
import { scrubPii } from "@/lib/sentry/scrub-pii";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // בלי session replay ובלי sendDefaultPii — ר' לוגים ב-CLAUDE.md: אף פעם לא PII.
  sendDefaultPii: false,
  beforeSend: scrubPii,

  // מעקב ביצועים כבוי כברירת מחדל — זו מערכת ניטור שגיאות, לא APM.
  tracesSampleRate: 0,
});

// נדרש ע"י ה-SDK כדי לתפוס שגיאות/ניווט ב-App Router, גם כש-tracing כבוי.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
