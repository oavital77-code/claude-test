"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { notifyBookingCancelled } from "@/lib/notifications/cancellation";
import { dayBoundaries, addDaysToDateStr } from "@/lib/availability/grid";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type RecurringBookingResult =
  | { ok: true; created: number; skipped: { date: string; error: string }[] }
  | { ok: false; error: string };

/** כל התאריכים מ-anchorDate (כולל) ואילך, אותו יום בשבוע, עד סוף אותו חודש קלנדרי. */
function monthlyOccurrences(anchorDate: string): string[] {
  const dates = [anchorDate];
  const monthPrefix = anchorDate.slice(0, 7);
  let cur = anchorDate;
  while (true) {
    const next = addDaysToDateStr(cur, 7);
    if (next.slice(0, 7) !== monthPrefix) break;
    dates.push(next);
    cur = next;
  }
  return dates;
}

/**
 * שיבוץ חוזר "קל" — לא ססיה אמיתית (בלי session_subscriptions, בלי תשלום,
 * בלי הגבלת session_base_hours): פשוט יוצר הזמנת admin_comp רגילה בכל
 * הופעה של אותו יום+שעה מהתאריך שנבחר ועד סוף החודש הקלנדרי. חלק מההופעות
 * יכולות להיכשל (למשל התנגשות אמיתית) בלי לבטל את השאר — כל שבוע נבדק
 * בנפרד דרך admin_create_booking הרגיל (כולל FOR UPDATE משלו).
 */
export async function adminCreateRecurringBookingAction(
  userId: string,
  roomId: string,
  anchorDate: string,
  startTime: string,
  endTime: string,
  note: string,
  charge: boolean,
): Promise<RecurringBookingResult> {
  await requireAdmin();
  const supabase = await createClient();

  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);

  let created = 0;
  const skipped: { date: string; error: string }[] = [];

  for (const d of monthlyOccurrences(anchorDate)) {
    const { start: dayStart } = dayBoundaries(d);
    const startsAt = new Date(dayStart.getTime() + (sh * 60 + sm) * 60_000).toISOString();
    const endsAt = new Date(dayStart.getTime() + (eh * 60 + em) * 60_000).toISOString();

    const { error } = await supabase.rpc("admin_create_booking", {
      p_user_id: userId,
      p_room_id: roomId,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_note: note || null,
      p_charge: charge,
    });

    if (error) skipped.push({ date: d, error: bookingErrorMessage(error.message) });
    else created += 1;
  }

  if (created === 0) {
    return { ok: false, error: skipped[0]?.error ?? "לא נוצרה אף הזמנה" };
  }
  return { ok: true, created, skipped };
}

export async function adminCreateBookingAction(
  userId: string,
  roomId: string,
  startsAt: string,
  endsAt: string,
  note: string,
  charge: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  // charge: לקזז מהכרטיסייה (יכול לרדת למינוס — החלטת אדמין) או שיבוץ בלי חיוב.
  const { error } = await supabase.rpc("admin_create_booking", {
    p_user_id: userId,
    p_room_id: roomId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_note: note || null,
    p_charge: charge,
  });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  return { ok: true };
}

/**
 * עריכת שיבוץ: תאריך / שעות / חדר. כרטיסייה — הפרש שעות יורד או חוזר
 * לכרטיסייה; מפגש ססיה — מוזז (ביטול + מפגש חדש) כדי שה-cron לא ישחזר את
 * המקורי. בלי מייל. ר' admin_edit_booking (20261015000002).
 */
export async function adminEditBookingAction(
  bookingId: string,
  roomId: string,
  startsAt: string,
  endsAt: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_edit_booking", {
    p_booking_id: bookingId,
    p_room_id: roomId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  return { ok: true };
}

export async function adminCancelBookingAction(bookingId: string, refundHours: boolean): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("source, admin_note")
    .eq("id", bookingId)
    .maybeSingle();
  const { error } = await supabase.rpc("admin_cancel_booking", {
    p_booking_id: bookingId,
    p_refund_hours: refundHours,
  });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };

  // מייל ביטול רק להזמנה שהמטפל/ת קבע/ה בעצמו/ה. שיבוץ שהאדמין פרס (שיבוץ
  // ידני, מפגש ססיה, או כרטיסייה שקוזזה בהעברה מ-Skedda — admin_note מסומן)
  // מבוטל בשקט — בקשת הבעלים: בלי הודעות למטפלים על פריסת המעבר.
  const placedByAdmin = !booking || booking.source !== "punch_card" || booking.admin_note !== null;
  if (!placedByAdmin) {
    notifyBookingCancelled(bookingId, refundHours).catch(() => {});
  }

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
