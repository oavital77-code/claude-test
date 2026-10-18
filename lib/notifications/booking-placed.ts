import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { sendEmail } from "@/lib/email/resend";
import { bookingConfirmedEmail, bookingRescheduledEmail } from "@/lib/email/templates";
import { generateSingleEventIcs } from "@/lib/ics";
import { accessWindow } from "@/lib/time";

/**
 * מייל אישור / עדכון למטפל/ת על הזמנה שאדמין קבע/שינה (לוח, שיבוץ חוזר) —
 * אותו מייל ואותו ICS שמטפל/ת מקבל/ת כשמזמין/ה בעצמו/ה. נקרא אחרי ה-RPC,
 * מחוץ לטרנזקציה; כישלון שליחה לא מבטל את ההזמנה. קליטה מ-Skedda לא קוראת
 * לזה בכוונה (בקשת הבעלים: בלי הודעות על פריסת המעבר).
 *
 * הלקוח מועבר מבחוץ: הקריאה רצה בתוך after(), ושם אין לסמוך על cookies().
 */
export async function notifyBookingPlaced(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  kind: "confirmed" | "rescheduled",
) {
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
  const { data: branch } = await supabase.from("branches").select("name").eq("id", room.branch_id).maybeSingle();

  const starts = new Date(booking.starts_at);
  const ends = new Date(booking.ends_at);
  const { accessStart, accessEnd } = accessWindow(starts, ends);
  const params = {
    roomName: room.name,
    branchName: branch?.name ?? "",
    startsAt: starts,
    endsAt: ends,
    accessStart,
    accessEnd,
  };
  const { subject, html } = kind === "confirmed" ? bookingConfirmedEmail(params) : bookingRescheduledEmail(params);

  // אותו uid כמו בשאר המיילים על ההזמנה — יומנים שתומכים בכך מעדכנים את האירוע.
  const ics = generateSingleEventIcs({
    uid: `booking-${bookingId}@baclinica.co.il`,
    summary: `בקליניקה — ${room.name}`,
    location: `${room.name}, ${branch?.name ?? ""}`,
    startsAt: starts,
    endsAt: ends,
  });

  await sendEmail({
    to: profile.email,
    subject,
    html,
    attachments: [{ filename: "booking.ics", content: Buffer.from(ics).toString("base64") }],
  });
}
