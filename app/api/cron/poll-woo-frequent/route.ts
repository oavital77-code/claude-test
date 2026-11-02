import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { cronFailedAdminEmail } from "@/lib/email/templates";
import { getAdminEmails } from "@/lib/email/recipients";
import { pollWooOrders } from "@/lib/woo/poll";

export const dynamic = "force-dynamic";

// בדיקת רכישות כל דקה, בלי תלות בכך שמישהו פותח את האפליקציה: pg_cron ב-
// Supabase קורא לכאן (Vercel Hobby מאפשר cron יומי בלבד). רכישה נזקפת תוך
// דקה, ומייל ההנהלה יוצא באותו רגע. סוד נפרד (WOO_POLL_SECRET, נשמר גם
// ב-Supabase Vault) — לא CRON_SECRET, שלא יוצא מ-Vercel.
//
// חלון 120 דקות לפי תאריך יצירה: ריצה שנכשלה מכוסה ע"י הריצות הבאות;
// תשלום מאוחר — ה-cron היומי (גם לפי תאריך עדכון).
//
// התראה להנהלה רק אחרי 5 כשלים רצופים (record_woo_poll_result) — תקלה
// רגעית בחנות (503 בודד, איטיות) לא שולחת מייל; הצלחה אחת מאפסת.
const FAILURE_THRESHOLD = 5;

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
  const detail = `נכשלה ${FAILURE_THRESHOLD} דקות ברציפות — רכישות חדשות לא נקלטות כרגע. שגיאה אחרונה: ${lastError}`;
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
