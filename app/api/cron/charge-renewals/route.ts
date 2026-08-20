import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargeByToken } from "@/lib/payplus/client";
import { sendEmail } from "@/lib/email/resend";
import { sessionRenewedEmail, paymentFailedEmail } from "@/lib/email/templates";
import { getAdminEmails } from "@/lib/email/recipients";

// יומי 06:00 — charge_session_renewals. ר' spec §6.7.
// chargeByToken אינו ממומש עדיין (ר' lib/payplus/client.ts) — עד שיאומת מול
// תיעוד PayPlus, כל ניסיון חיוב נכשל ועובר בנתיב הכישלון התקין (retry
// count -> השעיה אחרי 3 נסיונות), במקום להיתקע בשקט. זה מתועד, לא מוסתר.
export async function GET() {
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const adminEmails = await getAdminEmails(supabase);

  const { data: dueSubscriptions, error } = await supabase
    .from("session_subscriptions")
    .select("id, next_billing_date, effective_end_date, status")
    .lte("next_billing_date", today)
    .in("status", ["active", "pending_cancellation"]);

  if (error) {
    return NextResponse.json({ error: "QUERY_FAILED" }, { status: 500 });
  }

  const results: { subscriptionId: string; outcome: string }[] = [];

  for (const sub of dueSubscriptions ?? []) {
    if (
      sub.status === "pending_cancellation" &&
      sub.effective_end_date &&
      sub.next_billing_date &&
      sub.next_billing_date > sub.effective_end_date
    ) {
      results.push({ subscriptionId: sub.id, outcome: "past_effective_end_date_skipped" });
      continue;
    }

    const { data: created, error: createError } = await supabase
      .rpc("create_session_renewal_payment", { p_subscription_id: sub.id })
      .single();

    if (createError || !created) {
      results.push({ subscriptionId: sub.id, outcome: "create_payment_failed" });
      continue;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, payplus_token_uid")
      .eq("id", created.user_id)
      .maybeSingle();

    if (!profile?.payplus_token_uid) {
      await supabase.rpc("finalize_session_renewal", {
        p_payment_id: created.payment_id,
        p_success: false,
        p_reason: "אין כרטיס שמור",
      });
      await notifyRenewalFailed(profile?.email, created.amount_total, adminEmails);
      results.push({ subscriptionId: sub.id, outcome: "no_saved_card" });
      continue;
    }

    try {
      const charge = await chargeByToken(profile.payplus_token_uid, created.amount_total, created.payment_id);
      await supabase.rpc("finalize_session_renewal", {
        p_payment_id: created.payment_id,
        p_success: charge.success,
        p_transaction_uid: charge.transactionUid,
        p_invoice_url: charge.invoiceUrl ?? null,
        p_reason: charge.failureReason ?? null,
      });
      if (charge.success) {
        await notifyRenewalSucceeded(profile.email, created.amount_total, charge.invoiceUrl);
      } else {
        await notifyRenewalFailed(profile.email, created.amount_total, adminEmails);
      }
      results.push({ subscriptionId: sub.id, outcome: charge.success ? "charged" : "declined" });
    } catch (err) {
      await supabase.rpc("finalize_session_renewal", {
        p_payment_id: created.payment_id,
        p_success: false,
        p_reason: err instanceof Error ? err.message : "charge_by_token_unavailable",
      });
      await notifyRenewalFailed(profile.email, created.amount_total, adminEmails);
      results.push({ subscriptionId: sub.id, outcome: "charge_call_failed" });
    }
  }

  return NextResponse.json({ checked: dueSubscriptions?.length ?? 0, results });
}

async function notifyRenewalSucceeded(email: string, amountTotal: number, invoiceUrl?: string) {
  const { subject, html } = sessionRenewedEmail(amountTotal, invoiceUrl);
  await sendEmail({ to: email, subject, html }).catch(() => {});
}

async function notifyRenewalFailed(email: string | undefined, amountTotal: number, adminEmails: string[]) {
  const { subject, html } = paymentFailedEmail({ amountTotal, context: "חידוש ססיה" });
  const recipients = [email, ...adminEmails].filter(Boolean) as string[];
  if (recipients.length === 0) return;
  await sendEmail({ to: recipients, subject, html }).catch(() => {});
}
