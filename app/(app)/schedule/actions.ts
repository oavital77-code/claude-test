"use server";

import { after } from "next/server";
import { z } from "zod";
import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { sendEmail } from "@/lib/email/resend";
import { bookingConfirmedEmail } from "@/lib/email/templates";
import { generateSingleEventIcs } from "@/lib/ics";
import { accessWindow, isAlignedTo30Minutes } from "@/lib/time";
import { deleteCleanaPlusConnection, getCleanaPlusStatus, getCleanaPlusToken } from "@/lib/cleana-plus/connection";
import { cleanaPlusConfig } from "@/lib/cleana-plus/oauth";
import { openSlotsInCleanaPlus, type OpenSlotsOutcome } from "@/lib/cleana-plus/slots";

export type BookSlotResult =
  | {
      ok: true;
      bookingId: string;
      hoursCharged: number;
      hoursRemaining: number;
      /** חשבון Cleana+ מחובר — ה-UI פותח את השעות שם מיד אחרי האישור. */
      cleanaPlusConnected: boolean;
    }
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
  const { userId, profile } = await requireTherapistProfile();

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
  after(() => sendBookingConfirmation(profile.email, roomId, new Date(startsAt), new Date(endsAt), data.booking_id).catch(() => {}));

  const cleanaPlus = await getCleanaPlusStatus(userId).catch(() => ({ connected: false }));

  return {
    ok: true,
    bookingId: data.booking_id,
    hoursCharged: data.hours_charged,
    hoursRemaining: data.hours_remaining,
    cleanaPlusConnected: cleanaPlus.connected,
  };
}

export type OpenInCleanaPlusResult =
  | Extract<OpenSlotsOutcome, { status: "opened" }>
  | { status: "not_connected" }
  | { status: "subscription_inactive"; billingUrl: string }
  | { status: "failed" };

/**
 * פתיחת השעות של הזמנה ב-Cleana+ (שלב 2 בסנכרון). נקרא מה-UI מיד אחרי אישור
 * הזמנה, ובלחיצה על "נסו שוב". בטוח לחזרה: Cleana+ פותחת כל הזמנה פעם אחת.
 *
 * 🔒 ההזמנה נקראת דרך ה-client של המשתמש/ת (RLS: own_bookings), ונבדק שהיא
 * של המשתמש/ת המחובר/ת — אי אפשר לפתוח שעות של הזמנה של מישהו אחר.
 */
export async function openBookingInCleanaPlus(bookingId: string): Promise<OpenInCleanaPlusResult> {
  const { userId } = await requireTherapistProfile();
  if (!z.guid().safeParse(bookingId).success) return { status: "failed" };

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, user_id, room_id, starts_at, ends_at, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.user_id !== userId || booking.status !== "confirmed") return { status: "failed" };

  const { data: room } = await supabase.from("rooms").select("name, branch_id").eq("id", booking.room_id).maybeSingle();
  if (!room) return { status: "failed" };
  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, address")
    .eq("id", room.branch_id)
    .maybeSingle();
  if (!branch) return { status: "failed" };

  const config = cleanaPlusConfig();
  const token = await getCleanaPlusToken(userId);
  if (!config || !token) return { status: "not_connected" };

  const outcome = await openSlotsInCleanaPlus(config, token, {
    bookingId: booking.id,
    branch: { id: branch.id, name: branch.name, address: branch.address },
    room: room.name,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
  });

  // נותק/ה בצד Cleana+ — המפתח כבר לא שווה כלום; מוחקים אותו כאן כדי שהכרטיס
  // האישי יראה "לא מחובר" ויציע להתחבר מחדש.
  if (outcome.status === "revoked") {
    await deleteCleanaPlusConnection(userId);
    return { status: "not_connected" };
  }
  if (outcome.status === "subscription_inactive") {
    return { status: "subscription_inactive", billingUrl: `${config.baseUrl}/dashboard/billing` };
  }
  return outcome;
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
