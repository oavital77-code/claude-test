import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { cronFailedAdminEmail } from "@/lib/email/templates";
import { getAdminEmails } from "@/lib/email/recipients";
import { pollWooOrders } from "@/lib/woo/poll";

export const dynamic = "force-dynamic";

// בדיקת רכישות ברקע — פעם בשעה (החלטת הבעלים 07/11), בלי תלות בכך שמישהו
// פותח את האפליקציה: pg_cron ב-Supabase קורא לכאן ב-:00 (20261107000002).
// רכישה נקלטת מיד כשהמטפל/ת חוזר/ת לאפליקציה (PurchaseSync), ולכל המאוחר
// תוך שעה כאן. היסטוריה: כל דקה → 07/11 חשבון ה-Vercel (Hobby) הושבת על
// חריגה ממכסה → 5 דקות → שעה.
//
// חלון 120 דקות לפי תאריך יצירה: ריצה אחת שנכשלה מכוסה ע"י הבאה; תשלום
// מאוחר — ה-cron היומי (גם לפי תאריך עדכון).
//
// התראה להנהלה אחרי 2 כשלים רצופים (~שעתיים, record_woo_poll_result) —
// תקלה רגעית בחנות לא שולחת מייל; הצלחה אחת מאפסת.
const FAILURE_THRESHOLD = 2;

async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request, "WOO_POLL_SECRET")) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const supabase = createAdminClient();
  try {
    const result = await pollWooOrders(120, { throttleSeconds: 30 });
    await supabase.rpc("record_woo_poll_result", { p_ok: true });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    console.error("[cron:poll-woo-frequent] נכשל:", message);
    try {
      const { data: shouldAlert } = await supabase.rpc("record_woo_poll_result", {
        p_ok: false,
        p_threshold: FAILURE_THRESHOLD,
      });
      if (shouldAlert) await alertAdmins(supabase, message);
    } catch {
      // best-effort
    }
    return NextResponse.json({ error: "POLL_FAILED" }, { status: 500 });
  }
}

async function alertAdmins(supabase: ReturnType<typeof createAdminClient>, lastError: string) {
  const detail = `נכשלה ${FAILURE_THRESHOLD} פעמים ברציפות (כ-${FAILURE_THRESHOLD} שעות) — רכישות חדשות לא נקלטות כרגע. שגיאה אחרונה: ${lastError}`;
  await supabase.from("audit_log").insert({
    actor_id: null,
    action: "woo_frequent_poll_failed",
    entity: "woo",
    after: { detail },
  });
  const adminEmails = await getAdminEmails(supabase);
  if (adminEmails.length === 0) return;
  const { subject, html } = cronFailedAdminEmail({ jobName: "בדיקת רכישות כל דקה", detail });
  await sendEmail({ to: adminEmails, subject, html });
}

export const GET = handle;
export const POST = handle;
