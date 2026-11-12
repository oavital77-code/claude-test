import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { createAdminClient } from "@/lib/supabase/admin";
import { TIMEZONE } from "@/lib/time";
import { deleteCleanaPlusConnection, getCleanaPlusToken } from "./connection";
import { cleanaPlusConfig } from "./oauth";
import { bookedInCleanaPlus, closeSlotsInCleanaPlus, openSlotsInCleanaPlus } from "./slots";

// סנכרון Cleana → Cleana+ סביב ביטול ושינוי של הזמנה (שלב 3).
//
// 🔒 כל פונקציה כאן מקבלת therapistId שהקורא כבר אימת: המטפל/ת המחובר/ת
// (הזמנה שלה/ו), או בעל/ת ההזמנה כפי שאדמין קרא/ה אותה. ההזמנה נטענת עם
// service role כי אדמין פועל/ת על הזמנות של אחרים — ולכן נבדק שהיא של
// therapistId לפני כל קריאה ל-Cleana+.
//
// כשל כאן לעולם לא נוגע בהזמנה ב-Cleana: הכל best-effort.

type SyncBooking = {
  id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  room: { name: string; branch: { id: string; name: string; address: string } };
};

async function loadBooking(bookingId: string): Promise<SyncBooking | null> {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, user_id, room_id, starts_at, ends_at, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;
  const { data: room } = await admin.from("rooms").select("name, branch_id").eq("id", booking.room_id).maybeSingle();
  if (!room) return null;
  const { data: branch } = await admin
    .from("branches")
    .select("id, name, address")
    .eq("id", room.branch_id)
    .maybeSingle();
  if (!branch) return null;
  return { ...booking, room: { name: room.name, branch } };
}

async function credentials(therapistId: string) {
  const config = cleanaPlusConfig();
  const token = config ? await getCleanaPlusToken(therapistId) : null;
  return config && token ? { config, token } : null;
}

export type CleanaPlusBookedTimes =
  | { status: "none" }
  | { status: "booked"; times: string[] }
  | { status: "unknown" };

/**
 * לפני ביטול/שינוי: אילו שעות של ההזמנה כבר נקבעו ע"י לקוחות ב-Cleana+.
 * "unknown" — מחובר/ת, אבל Cleana+ לא ענתה; ה-UI מזהיר בעדינות במקום לשתוק.
 */
export async function cleanaPlusBookedTimes(therapistId: string, bookingId: string): Promise<CleanaPlusBookedTimes> {
  const creds = await credentials(therapistId);
  if (!creds) return { status: "none" };
  const check = await bookedInCleanaPlus(creds.config, creds.token, bookingId);
  if (check.status === "revoked") {
    await deleteCleanaPlusConnection(therapistId);
    return { status: "none" };
  }
  if (check.status === "failed") return { status: "unknown" };
  if (check.times.length === 0) return { status: "none" };
  return { status: "booked", times: check.times.map((t) => formatInTimeZone(new Date(t), TIMEZONE, "HH:mm")) };
}

/** ההזמנה בוטלה: סגירת המשבצות ב-Cleana+. מחזיר אם היו שם משבצות בכלל. */
export async function closeCleanaPlusForBooking(therapistId: string, bookingId: string): Promise<boolean> {
  const creds = await credentials(therapistId);
  if (!creds) return false;
  const outcome = await closeSlotsInCleanaPlus(creds.config, creds.token, bookingId);
  if (outcome.status === "revoked") {
    await deleteCleanaPlusConnection(therapistId);
    return false;
  }
  return outcome.status === "closed" && (outcome.closed > 0 || outcome.noRoom.length > 0);
}

/**
 * ההזמנה שונתה (שעה/חדר): המשבצות הישנות נסגרות, ואם היו כאלה — נפתחות
 * משבצות לשעות החדשות. מי שלא פתח/ה את ההזמנה ב-Cleana+ מלכתחילה, לא מקבל/ת
 * פתאום תורים שם.
 */
export async function moveCleanaPlusForBooking(
  therapistId: string,
  oldBookingId: string,
  newBookingId: string = oldBookingId,
): Promise<void> {
  const hadSlots = await closeCleanaPlusForBooking(therapistId, oldBookingId);
  if (!hadSlots) return;
  const creds = await credentials(therapistId);
  const booking = await loadBooking(newBookingId);
  if (!creds || !booking || booking.user_id !== therapistId || booking.status !== "confirmed") return;
  await openSlotsInCleanaPlus(creds.config, creds.token, {
    bookingId: booking.id,
    branch: booking.room.branch,
    room: booking.room.name,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
  });
}

/** בעל/ת ההזמנה — לפעולות אדמין, שמקבל/ת רק מזהה הזמנה. */
export async function bookingOwner(bookingId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("bookings").select("user_id").eq("id", bookingId).maybeSingle();
  return data?.user_id ?? null;
}
