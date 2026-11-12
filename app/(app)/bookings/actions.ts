"use server";

import { after } from "next/server";
import { z } from "zod";
import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { notifyBookingCancelled } from "@/lib/notifications/cancellation";
import { sendEmail } from "@/lib/email/resend";
import { bookingRescheduledEmail } from "@/lib/email/templates";
import { generateSingleEventIcs } from "@/lib/ics";
import { accessWindow, isAlignedTo30Minutes } from "@/lib/time";
import {
  cleanaPlusBookedTimes,
  closeCleanaPlusForBooking,
  moveCleanaPlusForBooking,
  type CleanaPlusBookedTimes,
} from "@/lib/cleana-plus/sync";

export type CancelBookingResult =
  | { ok: true; hoursRefunded: boolean }
  | { ok: false; error: string };

export async function cancelBookingAction(bookingId: string): Promise<CancelBookingResult> {
  const { userId } = await requireTherapistProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("cancel_booking", { p_booking_id: bookingId })
    .single();

  if (error || !data) {
    return { ok: false, error: bookingErrorMessage(error?.message) };
  }

  after(() => notifyBookingCancelled(bookingId, data.hours_refunded).catch(() => {}));
  // החדר בוטל — המשבצות הפנויות ב-Cleana+ נסגרות, ותור שנקבע מסומן "אין חדר".
  after(() => closeCleanaPlusForBooking(userId, bookingId).catch(() => {}));

  return { ok: true, hoursRefunded: data.hours_refunded };
}

/**
 * לפני ביטול/שינוי: האם לקוחות כבר קבעו ב-Cleana+ בשעות של ההזמנה.
 * 🔒 רק על הזמנה של המשתמש/ת המחובר/ת.
 */
export async function cleanaPlusWarningForBooking(bookingId: string): Promise<CleanaPlusBookedTimes> {
  const { userId } = await requireTherapistProfile();
  if (!z.guid().safeParse(bookingId).success) return { status: "none" };
  const supabase = await createClient();
  const { data } = await supabase.from("bookings").select("user_id").eq("id", bookingId).maybeSingle();
  if (!data || data.user_id !== userId) return { status: "none" };
  return cleanaPlusBookedTimes(userId, bookingId);
}

export type RescheduleBookingResult =
  | { ok: true; hoursDelta: number }
  | { ok: false; error: string };

// שכבה ראשונה בלבד — reschedule_booking אוכף את כל הכללים (חלון ביטול,
// חפיפה, יתרה, טווח ימים) בתוך טרנזקציה אחת.
const rescheduleSchema = z
  .object({
    bookingId: z.guid(),
    roomId: z.guid(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt))
  .refine((v) => isAlignedTo30Minutes(new Date(v.startsAt)) && isAlignedTo30Minutes(new Date(v.endsAt)));

/**
 * שינוי הזמנת כרטיסייה ע"י המטפל/ת — תאריך / שעות / חדר, בפעולה אחת.
 * מותר רק מחוץ לחלון הביטול (אותה חוקיות כמו ביטול). אם המועד החדש תפוס
 * או שאין יתרה — שום דבר לא משתנה. ר' 20261016000004.
 */
export async function rescheduleBookingAction(input: {
  bookingId: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
}): Promise<RescheduleBookingResult> {
  const { userId, profile } = await requireTherapistProfile();
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: bookingErrorMessage("INVALID_SLOT") };
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("reschedule_booking", {
      p_booking_id: d.bookingId,
      p_room_id: d.roomId,
      p_starts_at: d.startsAt,
      p_ends_at: d.endsAt,
    })
    .single();

  if (error || !data) return { ok: false, error: bookingErrorMessage(error?.message) };

  // מייל עדכון אסינכרוני, מחוץ לטרנזקציה — כישלון שליחה לא מבטל את השינוי.
  after(() => sendRescheduleEmail(profile.email, d.roomId, new Date(d.startsAt), new Date(d.endsAt), d.bookingId).catch(() => {}));
  // השעות זזו — המשבצות ב-Cleana+ זזות איתן (רק אם ההזמנה נפתחה שם).
  after(() => moveCleanaPlusForBooking(userId, d.bookingId).catch(() => {}));

  return { ok: true, hoursDelta: Number(data.hours_delta) };
}

async function sendRescheduleEmail(email: string, roomId: string, starts: Date, ends: Date, bookingId: string) {
  const supabase = await createClient();
  const { data: room } = await supabase.from("rooms").select("name, branch_id").eq("id", roomId).maybeSingle();
  if (!room) return;
  const { data: branch } = await supabase.from("branches").select("name").eq("id", room.branch_id).maybeSingle();

  const { accessStart, accessEnd } = accessWindow(starts, ends);
  const { subject, html } = bookingRescheduledEmail({
    roomName: room.name,
    branchName: branch?.name ?? "",
    startsAt: starts,
    endsAt: ends,
    accessStart,
    accessEnd,
  });

  // אותו uid כמו במייל האישור — יומנים שתומכים בכך מעדכנים את האירוע הקיים.
  const ics = generateSingleEventIcs({
    uid: `booking-${bookingId}@baclinica.co.il`,
    summary: `בקליניקה — ${room.name}`,
    location: `${room.name}, ${branch?.name ?? ""}`,
    startsAt: starts,
    endsAt: ends,
  });

  await sendEmail({
    to: email,
    subject,
    html,
    attachments: [{ filename: "booking.ics", content: Buffer.from(ics).toString("base64") }],
  });
}
