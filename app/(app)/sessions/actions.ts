"use server";

import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { generatePaymentLink } from "@/lib/payplus/client";
import { bookingErrorMessage } from "@/lib/booking-errors";
import type { SessionSlotDraft } from "@/lib/pricing/session";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function requestSession(
  slots: Pick<SessionSlotDraft, "roomId" | "weekday" | "startTime" | "endTime">[],
): Promise<ActionResult<{ subscriptionId: string }>> {
  await requireTherapistProfile();
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

  return { ok: true, data: { subscriptionId: data.subscription_id } };
}

export type PaymentRedirect = { ok: true; redirectUrl: string } | { ok: false; error: string };

export async function initiateSessionPayment(subscriptionId: string): Promise<PaymentRedirect> {
  const { profile } = await requireTherapistProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("create_session_initial_payment", { p_subscription_id: subscriptionId })
    .single();

  if (error || !data) {
    return { ok: false, error: "יצירת בקשת התשלום נכשלה. נסו שוב." };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const link = await generatePaymentLink({
      amountTotal: data.amount_total,
      createToken: true, // ססיה חייבת כרטיס אשראי + טוקן שמור לחידוש (§7.2)
      customerName: profile.full_name,
      customerEmail: profile.email,
      customerPhone: profile.phone,
      itemName: "מנוי ססיה — בקליניקה",
      moreInfo: data.payment_id,
      successUrl: `${baseUrl}/sessions?payment=success`,
      failureUrl: `${baseUrl}/sessions?payment=failure`,
      callbackUrl: `${baseUrl}/api/payplus/callback`,
    });

    await supabase.rpc("set_payment_page_uid", {
      p_payment_id: data.payment_id,
      p_page_uid: link.pageRequestUid,
    });

    return { ok: true, redirectUrl: link.paymentPageLink };
  } catch {
    return { ok: false, error: "יצירת דף התשלום נכשלה. נסו שוב מאוחר יותר." };
  }
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
