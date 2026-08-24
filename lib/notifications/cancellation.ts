import "server-only";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { bookingCancelledEmail } from "@/lib/email/templates";

/**
 * מייל ביטול הזמנה. נקרא אחרי cancel_booking/admin_cancel_booking — לא לפני,
 * ולא בתוך הטרנזקציה.
 */
export async function notifyBookingCancelled(bookingId: string, hoursRefunded: boolean) {
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("user_id, room_id, starts_at, ends_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return;

  const [{ data: profile }, { data: room }] = await Promise.all([
    supabase.from("profiles").select("email").eq("id", booking.user_id).maybeSingle(),
    supabase.from("rooms").select("name, branch_id").eq("id", booking.room_id).maybeSingle(),
  ]);
  if (!profile || !room) return;

  const { subject, html } = bookingCancelledEmail({
    roomName: room.name,
    startsAt: new Date(booking.starts_at),
    hoursRefunded,
  });
  await sendEmail({ to: profile.email, subject, html });
}
