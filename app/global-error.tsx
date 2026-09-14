"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-semibold">משהו השתבש</h1>
          <p className="max-w-sm text-gray-500">
            אירעה שגיאה בלתי צפויה. הצוות שלנו קיבל התראה. אפשר לנסות שוב.
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600"
          >
            נסה שוב
          </button>
        </div>
      </body>
    </html>
  );
}
