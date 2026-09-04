import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { cronFailedAdminEmail } from "@/lib/email/templates";
import { getAdminEmails } from "@/lib/email/recipients";
import { isAuthorizedCronRequest } from "./auth";

/**
 * עוטף route handler של cron: דוחה בקשה לא-מאומתת (401) לפני שהיא מגיעה
 * ל-handler, ובנוסף — כישלון בפועל (חריגה, או תגובת {error, status>=400})
 * מתועד ומדווח לאדמינים במייל, כדי שכישלון שקט לא יעבור בלי שאף אחד ידע.
 * ר' punch list — "התראה כשמשימת cron נכשלת בשקט".
 */
export function withCronAlert(jobName: string, handler: () => Promise<NextResponse>) {
  return async function GET(request: Request) {
    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    try {
      const response = await handler();
      if (response.status >= 400) {
        const body = await response.clone().text();
        await alertAdmins(jobName, body || `HTTP ${response.status}`);
      }
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : "UNKNOWN";
      await alertAdmins(jobName, message);
      return NextResponse.json({ error: "CRON_FAILED" }, { status: 500 });
    }
  };
}

async function alertAdmins(jobName: string, detail: string) {
  console.error(`[cron:${jobName}] נכשל: ${detail}`);
  const supabase = createAdminClient();
  const adminEmails = await getAdminEmails(supabase);
  if (adminEmails.length === 0) return;
  const { subject, html } = cronFailedAdminEmail({ jobName, detail });
  await sendEmail({ to: adminEmails, subject, html }).catch(() => {});
}
