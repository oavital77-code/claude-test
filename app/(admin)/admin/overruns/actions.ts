"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargeByToken } from "@/lib/payplus/client";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { sendEmail } from "@/lib/email/resend";
import { overrunRecordedEmail, paymentFailedEmail } from "@/lib/email/templates";
import { getAdminEmails } from "@/lib/email/recipients";

export type PreviewResult =
  | {
      ok: true;
      hours: number;
      pricePerHour: number;
      amount: number;
      depositAvailable: number;
      needsCharge: boolean;
    }
  | { ok: false; error: string };

export async function previewOverrunAction(bookingId: string, minutes: number): Promise<PreviewResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("preview_overrun", { p_booking_id: bookingId, p_minutes: minutes })
    .single();
  if (error || !data) return { ok: false, error: bookingErrorMessage(error?.message) };
  return {
    ok: true,
    hours: data.hours,
    pricePerHour: data.price_per_hour,
    amount: data.amount,
    depositAvailable: data.deposit_available,
    needsCharge: data.needs_charge,
  };
}

export type RecordResult =
  | { ok: true; source: "deposit" | "charge_succeeded" | "charge_failed" }
  | { ok: false; error: string };

export async function recordOverrunAction(
  bookingId: string,
  minutes: number,
  note: string,
): Promise<RecordResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: booking } = await supabase.from("bookings").select("user_id").eq("id", bookingId).maybeSingle();

  const { data, error } = await supabase
    .rpc("record_overrun", { p_booking_id: bookingId, p_minutes: minutes, p_note: note })
    .single();

  if (error || !data) return { ok: false, error: bookingErrorMessage(error?.message) };

  const { data: profile } = booking
    ? await supabase.from("profiles").select("email").eq("id", booking.user_id).maybeSingle()
    : { data: null };

  if (data.source === "deposit" || !data.payment_id) {
    if (profile) {
      const { subject, html } = overrunRecordedEmail({ minutes, amount: data.amount, source: "deposit" });
      await sendEmail({ to: profile.email, subject, html }).catch(() => {});
    }
    return { ok: true, source: "deposit" };
  }

  // אין מספיק פיקדון — יש payment ב-pending (נוצר ע"י record_overrun). מנסים
  // לחייב את הכרטיס השמור, ואז סוגרים את התוצאה דרך finalize_overrun_charge
  // (פונקציית service/admin — ר' assert_service_or_admin במיגרציה).
  const admin = createAdminClient();
  const paymentId = data.payment_id;

  const { data: payment } = await admin
    .from("payments")
    .select("user_id, amount_total")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) {
    return { ok: false, error: "שגיאה באיתור התשלום שנוצר" };
  }

  const { data: payerProfile } = await admin
    .from("profiles")
    .select("email, payplus_token_uid")
    .eq("id", payment.user_id)
    .maybeSingle();

  if (!payerProfile?.payplus_token_uid) {
    await admin.rpc("finalize_overrun_charge", {
      p_payment_id: paymentId,
      p_success: false,
      p_reason: "אין כרטיס שמור",
    });
    await notifyChargeFailed(admin, payerProfile?.email, payment.amount_total);
    return { ok: true, source: "charge_failed" };
  }

  try {
    const charge = await chargeByToken(payerProfile.payplus_token_uid, payment.amount_total, paymentId);
    await admin.rpc("finalize_overrun_charge", {
      p_payment_id: paymentId,
      p_success: charge.success,
      p_transaction_uid: charge.transactionUid,
      p_reason: charge.failureReason ?? null,
    });
    if (charge.success) {
      const { subject, html } = overrunRecordedEmail({ minutes, amount: data.amount, source: "charge" });
      await sendEmail({ to: payerProfile.email, subject, html }).catch(() => {});
    } else {
      await notifyChargeFailed(admin, payerProfile.email, payment.amount_total);
    }
    return { ok: true, source: charge.success ? "charge_succeeded" : "charge_failed" };
  } catch (err) {
    await admin.rpc("finalize_overrun_charge", {
      p_payment_id: paymentId,
      p_success: false,
      p_reason: err instanceof Error ? err.message : "charge_by_token_unavailable",
    });
    await notifyChargeFailed(admin, payerProfile.email, payment.amount_total);
    return { ok: true, source: "charge_failed" };
  }
}

async function notifyChargeFailed(
  admin: ReturnType<typeof createAdminClient>,
  email: string | undefined,
  amountTotal: number,
) {
  const adminEmails = await getAdminEmails(admin);
  const recipients = [email, ...adminEmails].filter(Boolean) as string[];
  if (recipients.length === 0) return;
  const { subject, html } = paymentFailedEmail({ amountTotal, context: "חריגת זמן" });
  await sendEmail({ to: recipients, subject, html }).catch(() => {});
}
