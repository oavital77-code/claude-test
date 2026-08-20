"use server";

import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { sendEmail } from "@/lib/email/resend";
import { sessionRequestedAdminEmail } from "@/lib/email/templates";
import { getAdminEmails } from "@/lib/email/recipients";
import { createSessionInitialPaymentLink, type SessionPaymentLinkResult } from "@/lib/payments/session-initial";
import type { SessionSlotDraft } from "@/lib/pricing/session";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function requestSession(
  slots: Pick<SessionSlotDraft, "roomId" | "weekday" | "startTime" | "endTime">[],
): Promise<ActionResult<{ subscriptionId: string }>> {
  const { profile } = await requireTherapistProfile();
  const supabase = await createClient();

  const payload = slots.map((s) => ({
    room_id: s.roomId,
    weekday: s.weekday,
    start_time: s.startTime,
    end_time: s.endTime,
  }));

  const { data, error } = await supabase.rpc("request_session", { p_slots: payload }).single();

  if (error || !data) {
    return { ok: false, error: bookingErrorMessage(error?.message) };
  }

  notifyAdminOfSessionRequest(profile.full_name, data.weekly_hours, data.monthly_price).catch(() => {});

  return { ok: true, data: { subscriptionId: data.subscription_id } };
}

async function notifyAdminOfSessionRequest(therapistName: string, weeklyHours: number, monthlyPrice: number) {
  const supabase = await createClient();
  const adminEmails = await getAdminEmails(supabase);
  if (adminEmails.length === 0) return;
  const { subject, html } = sessionRequestedAdminEmail({ therapistName, weeklyHours, monthlyPrice });
  await sendEmail({ to: adminEmails, subject, html });
}

export type PaymentRedirect = SessionPaymentLinkResult;

export async function initiateSessionPayment(subscriptionId: string): Promise<PaymentRedirect> {
  const { profile } = await requireTherapistProfile();
  const supabase = await createClient();
  return createSessionInitialPaymentLink(supabase, subscriptionId, {
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
  });
}

export async function requestCancellation(
  subscriptionId: string,
): Promise<ActionResult<{ effectiveEndDate: string }>> {
  await requireTherapistProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("request_subscription_cancellation", { p_subscription_id: subscriptionId })
    .single();

  if (error || !data) {
    return { ok: false, error: bookingErrorMessage(error?.message) };
  }

  return { ok: true, data: { effectiveEndDate: data.effective_end_date } };
}
