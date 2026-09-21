"use server";

import { z } from "zod";
import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { sendEmail } from "@/lib/email/resend";
import { bookingConfirmedEmail } from "@/lib/email/templates";
import { generateSingleEventIcs } from "@/lib/ics";
import { accessWindow, isAlignedTo30Minutes } from "@/lib/time";

export type BookSlotResult =
  | { ok: true; hoursCharged: number; hoursRemaining: number }
  | { ok: false; error: string };

// Server Action = נקודת כניסה ציבורית לכל משתמש מחובר, עם ארגומנטים
// שרירותיים — לא רק מה שה-UI שולח. create_booking אוכף את כל הכללים
// העסקיים (יתרה, חפיפה, חלון זמן), והסכמה הזו היא שכבה ראשונה שדוחה
// קלט פסול לפני round-trip ל-DB ומחזירה הודעה בעברית במקום שגיאת SQL.
const bookSlotSchema = z
  .object({
    roomId: z.guid(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: "INVALID_SLOT",
  })
  .refine(
    (v) => isAlignedTo30Minutes(new Date(v.startsAt)) && isAlignedTo30Minutes(new Date(v.endsAt)),
    { message: "INVALID_SLOT" },
  );

export async function bookSlot(
  roomId: string,
  startsAt: string,
  endsAt: string,
): Promise<BookSlotResult> {
  const { profile } = await requireTherapistProfile();

  const parsed = bookSlotSchema.safeParse({ roomId, startsAt, endsAt });
  if (!parsed.success) {
    return { ok: false, error: bookingErrorMessage("INVALID_SLOT") };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("create_booking", { p_room_id: roomId, p_starts_at: startsAt, p_ends_at: endsAt })
    .single();

  if (error || !data) {
    return { ok: false, error: bookingErrorMessage(error?.message) };
  }

  // מייל אישור אסינכרוני, מחוץ לטרנזקציה (§6.1) — כישלון שליחה לא מבטל הזמנה שכבר אושרה.
  sendBookingConfirmation(profile.email, roomId, new Date(startsAt), new Date(endsAt), data.booking_id).catch(
    () => {},
  );

  return { ok: true, hoursCharged: data.hours_charged, hoursRemaining: data.hours_remaining };
}

async function sendBookingConfirmation(
  email: string,
  roomId: string,
  starts: Date,
  ends: Date,
  bookingId: string,
) {
  const supabase = await createClient();
  const { data: room } = await supabase.from("rooms").select("name, branch_id").eq("id", roomId).maybeSingle();
  if (!room) return;
  const { data: branch } = await supabase.from("branches").select("name").eq("id", room.branch_id).maybeSingle();

  const { accessStart, accessEnd } = accessWindow(starts, ends);
  const { subject, html } = bookingConfirmedEmail({
    roomName: room.name,
    branchName: branch?.name ?? "",
    startsAt: starts,
    endsAt: ends,
    accessStart,
    accessEnd,
  });

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
