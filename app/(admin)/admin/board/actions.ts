"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { bookingErrorMessage } from "@/lib/booking-errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function adminCreateBookingAction(
  userId: string,
  roomId: string,
  startsAt: string,
  endsAt: string,
  note: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_booking", {
    p_user_id: userId,
    p_room_id: roomId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_note: note || null,
  });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  return { ok: true };
}

export async function adminCancelBookingAction(bookingId: string, refundHours: boolean): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_cancel_booking", {
    p_booking_id: bookingId,
    p_refund_hours: refundHours,
  });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  return { ok: true };
}

export async function createRoomBlockAction(
  roomId: string,
  startsAt: string,
  endsAt: string,
  reason: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("room_blocks").insert({
    room_id: roomId,
    starts_at: startsAt,
    ends_at: endsAt,
    reason,
  });
  if (error) return { ok: false, error: "יצירת החסימה נכשלה — ייתכן שיש חפיפה לחסימה קיימת" };
  return { ok: true };
}

export async function deleteRoomBlockAction(blockId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("room_blocks").delete().eq("id", blockId);
  if (error) return { ok: false, error: "מחיקת החסימה נכשלה" };
  return { ok: true };
}
