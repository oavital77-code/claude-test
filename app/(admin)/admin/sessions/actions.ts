"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { sendEmail } from "@/lib/email/resend";
import { sessionApprovedEmail, sessionRejectedEmail } from "@/lib/email/templates";
import { createSessionInitialPaymentLink } from "@/lib/payments/session-initial";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function adminCreateSessionAction(
  userId: string,
  slots: { roomId: string; weekday: number; startTime: string; endTime: string }[],
  startDate?: string | null,
  termMonths?: number | null,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const payload = slots.map((s) => ({
    room_id: s.roomId,
    weekday: s.weekday,
    start_time: s.startTime,
    end_time: s.endTime,
  }));

  const { data, error } = await supabase
    .rpc("admin_create_session", {
      p_user_id: userId,
      p_slots: payload,
      p_start_date: startDate ?? null,
      p_term_months: termMonths ?? null,
    })
    .single();

  if (error || !data) return { ok: false, error: bookingErrorMessage(error?.message) };

  // נחיתה ישירה ב-awaiting_payment (מדלגים על 'requested' — קביעה ע"י אדמין
  // היא עצמה האישור, §5) — אבל התשלום עצמו עדיין עובר כרגיל, בדיוק כמו אישור
  // בקשה רגילה: יצירת קישור תשלום + מייל, אותה פונקציה בדיוק.
  notifyTherapistOfApproval(data.subscription_id).catch(() => {});

  return { ok: true };
}

export async function approveSessionAction(
  subscriptionId: string,
  termMonths?: number | null,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("approve_session", {
    p_subscription_id: subscriptionId,
    p_term_months: termMonths ?? null,
  });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };

  notifyTherapistOfApproval(subscriptionId).catch(() => {});

  return { ok: true };
}

export async function renewSessionTermAction(subscriptionId: string, termMonths: number): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_renew_session_term", {
    p_subscription_id: subscriptionId,
    p_term_months: termMonths,
  });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  return { ok: true };
}

export async function endSessionTermAction(subscriptionId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_end_session_term", { p_subscription_id: subscriptionId });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  return { ok: true };
}

async function notifyTherapistOfApproval(subscriptionId: string) {
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("session_subscriptions")
    .select("user_id")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!sub) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", sub.user_id)
    .maybeSingle();
  if (!profile) return;

  // §3.3: אישור → יצירת דף תשלום מיידית + מייל עם הקישור. אין תשלום לפני
  // אישור אדמין — אבל ברגע שאושר, הקישור נוצר ונשלח כאן, לא ממתין ללחיצה באפליקציה.
  const link = await createSessionInitialPaymentLink(supabase, subscriptionId);
  if (!link.ok) return;

  const { subject, html } = sessionApprovedEmail(link.redirectUrl);
  await sendEmail({ to: profile.email, subject, html });
}

export async function rejectSessionAction(subscriptionId: string, reason: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_session", {
    p_subscription_id: subscriptionId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };

  notifyTherapistOfRejection(subscriptionId, reason).catch(() => {});

  return { ok: true };
}

async function notifyTherapistOfRejection(subscriptionId: string, reason: string) {
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("session_subscriptions")
    .select("user_id")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!sub) return;

  const { data: profile } = await supabase.from("profiles").select("email").eq("id", sub.user_id).maybeSingle();
  if (!profile) return;

  const { subject, html } = sessionRejectedEmail(reason);
  await sendEmail({ to: profile.email, subject, html });
}
