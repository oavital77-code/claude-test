"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { bookingErrorMessage } from "@/lib/booking-errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function approveSessionAction(subscriptionId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_session", { p_subscription_id: subscriptionId });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  return { ok: true };
}

export async function rejectSessionAction(subscriptionId: string, reason: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_session", {
    p_subscription_id: subscriptionId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  return { ok: true };
}
