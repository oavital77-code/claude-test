import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { bookingCancelledEmail, waitlistSlotAvailableEmail } from "@/lib/email/templates";
import { TIMEZONE, formatDateHe } from "@/lib/time";

/**
 * מייל ביטול הזמנה + (§8.8) בדיקת רשימת המתנה למשבצת שהתפנתה.
 * נקרא אחרי cancel_booking/admin_cancel_booking — לא לפני, ולא בתוך הטרנזקציה.
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

  await notifyWaitlistMatches(booking.room_id, room.branch_id, room.name, new Date(booking.starts_at), new Date(booking.ends_at));
}

/** התפנה חלון מבוקש → מייל לכל הממתינים התואמים, first-come (§8.8). */
async function notifyWaitlistMatches(
  roomId: string,
  branchId: string,
  roomName: string,
  startsAt: Date,
  endsAt: Date,
) {
  const supabase = await createClient();
  const dateStr = formatInTimeZone(startsAt, TIMEZONE, "yyyy-MM-dd");
  const startTimeStr = formatInTimeZone(startsAt, TIMEZONE, "HH:mm:ss");
  const endTimeStr = formatInTimeZone(endsAt, TIMEZONE, "HH:mm:ss");

  const { data: candidates } = await supabase
    .from("waitlist")
    .select("id, user_id, room_id")
    .eq("branch_id", branchId)
    .eq("date", dateStr)
    .eq("fulfilled", false)
    .is("notified_at", null)
    .lt("start_time", endTimeStr)
    .gt("end_time", startTimeStr);

  const matches = (candidates ?? []).filter((c) => c.room_id === null || c.room_id === roomId);
  if (matches.length === 0) return;

  const dateLabel = formatDateHe(startsAt);
  const { subject, html } = waitlistSlotAvailableEmail({ roomName, date: dateLabel });

  for (const match of matches) {
    const { data: profile } = await supabase.from("profiles").select("email").eq("id", match.user_id).maybeSingle();
    if (!profile) continue;
    const result = await sendEmail({ to: profile.email, subject, html });
    if (result.ok) {
      await supabase
        .from("waitlist")
        .update({ notified_at: new Date().toISOString(), fulfilled: true })
        .eq("id", match.id);
    }
  }
}
