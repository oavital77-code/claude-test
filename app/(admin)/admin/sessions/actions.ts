"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { sendEmail } from "@/lib/email/resend";
import { sessionApprovedEmail, sessionRejectedEmail } from "@/lib/email/templates";
import { createSessionInitialPaymentLink } from "@/lib/payments/session-initial";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function approveSessionAction(subscriptionId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("approve_session", { p_subscription_id: subscriptionId });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };

  notifyTherapistOfApproval(subscriptionId).catch(() => {});

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
