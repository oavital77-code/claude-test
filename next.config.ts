import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
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
