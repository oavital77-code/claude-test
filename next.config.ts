import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // ברירת המחדל של Next.js היא 1MB, וזה חסם כל העלאת תמונת חדר מעל
      // מגהבייט (כלומר כמעט כל צילום מהטלפון) עוד לפני שהקוד של ה-action
      // רץ — כולל הוולידציה שמאשרת עד 5MB. 6MB משאיר מרווח ל-overhead של
      // multipart ולשאר הארגומנטים. ר' uploadRoomImage ב-admin/rooms/actions.ts.
      bodySizeLimit: "6mb",
    },
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // מבטל את הלוגים המפורטים של ה-plugin בזמן build.
  silent: true,
  // מעלה source maps ל-Sentry רק כשיש auth token מוגדר (build ב-CI/Vercel).
  // בלי token — ה-build ממשיך כרגיל, פשוט בלי source maps מפוענחים ב-Sentry.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // מסתיר את route ה-tunnel של Sentry מ-ad blockers; לא חובה אבל משפר אמינות דיווח.
  tunnelRoute: "/monitoring",
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
