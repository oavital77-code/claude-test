"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { bookingErrorMessage } from "@/lib/booking-errors";

// ניהול ססיות ע"י אדמין — כל שינוי "החל מתאריך": מה שלפניו נשאר כמו שהוא.
// שום פעולה כאן לא שולחת מייל ולא יוצרת תשלום (ר' 20261015000001).

export type ManageResult = { ok: true; message?: string } | { ok: false; error: string };

const time = z.string().regex(/^\d{2}:\d{2}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const slotFields = {
  roomId: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  startTime: time,
  endTime: time,
  from: date,
};

const MESSAGES: Record<string, string> = {
  INVALID_SUBSCRIPTION_STATUS: "הססיה כבר לא פעילה.",
  INVALID_START_DATE: "התאריך חייב להיות היום או מאוחר יותר.",
  INVALID_SLOT: "המשבצת לא תקינה — שעות בחצאי שעה, וסיום אחרי התחלה.",
};

function errorText(message: string): string {
  const code = Object.keys(MESSAGES).find((c) => message.includes(c));
  return code ? MESSAGES[code] : bookingErrorMessage(message);
}

function conflictNote(conflicts: number): string | undefined {
  return conflicts > 0
    ? `שימו לב: ${conflicts} מפגשים לא נקבעו כי החדר תפוס באותה שעה — בדקו בלוח.`
    : undefined;
}

function done(message?: string): ManageResult {
  revalidatePath("/admin/sessions/manage");
  return { ok: true, message };
}

export async function changeSlotAction(input: unknown): Promise<ManageResult> {
  await requireAdmin();
  const parsed = z.object({ slotId: z.string().uuid(), ...slotFields }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "קלט לא תקין" };
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_session_change_slot", {
    p_slot_id: d.slotId,
    p_room_id: d.roomId,
    p_weekday: d.weekday,
    p_start_time: d.startTime,
    p_end_time: d.endTime,
    p_from: d.from,
  });
  if (error) return { ok: false, error: errorText(error.message) };
  return done(conflictNote(data?.[0]?.conflicts ?? 0));
}

export async function removeSlotAction(input: unknown): Promise<ManageResult> {
  await requireAdmin();
  const parsed = z.object({ slotId: z.string().uuid(), from: date }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "קלט לא תקין" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_session_remove_slot", {
    p_slot_id: parsed.data.slotId,
    p_from: parsed.data.from,
  });
  if (error) return { ok: false, error: errorText(error.message) };
  return done();
}

export async function addSlotAction(input: unknown): Promise<ManageResult> {
  await requireAdmin();
  const parsed = z.object({ subscriptionId: z.string().uuid(), ...slotFields }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "קלט לא תקין" };
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_session_add_slot_from", {
    p_subscription_id: d.subscriptionId,
    p_room_id: d.roomId,
    p_weekday: d.weekday,
    p_start_time: d.startTime,
    p_end_time: d.endTime,
    p_from: d.from,
  });
  if (error) return { ok: false, error: errorText(error.message) };
  return done(conflictNote(data?.[0]?.conflicts ?? 0));
}

/** ביטול ססיה מתאריך; אופציונלי — להעביר את המטפל/ת לכרטיסייה עם X שעות. */
export async function cancelSessionAction(input: unknown): Promise<ManageResult> {
  await requireAdmin();
  const parsed = z
    .object({
      subscriptionId: z.string().uuid(),
      userId: z.string().uuid(),
      from: date,
      cardHours: z.number().min(0).max(500).optional().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "קלט לא תקין" };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_session_cancel", {
    p_subscription_id: d.subscriptionId,
    p_from: d.from,
  });
  if (error) return { ok: false, error: errorText(error.message) };

  if (d.cardHours && d.cardHours > 0) {
    const { error: grantError } = await supabase.rpc("grant_bonus_hours", {
      p_user_id: d.userId,
      p_hours: d.cardHours,
      p_note: "מעבר מססיה לכרטיסייה (ניהול ססיות)",
    });
    if (grantError) return { ok: false, error: "הססיה בוטלה, אבל הוספת השעות לכרטיסייה נכשלה — הוסיפו ידנית בכרטיס המטפל/ת." };
    return done(`הססיה בוטלה ונוספו ${d.cardHours} שעות לכרטיסייה.`);
  }
  return done();
}

export async function cancelOccurrenceAction(bookingId: string): Promise<ManageResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(bookingId).success) return { ok: false, error: "קלט לא תקין" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_cancel_booking", { p_booking_id: bookingId, p_refund_hours: false });
  if (error) return { ok: false, error: errorText(error.message) };
  return done();
}

export async function moveOccurrenceAction(input: unknown): Promise<ManageResult> {
  await requireAdmin();
  const parsed = z
    .object({
      bookingId: z.string().uuid(),
      roomId: z.string().uuid(),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "קלט לא תקין" };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_session_move_occurrence", {
    p_booking_id: d.bookingId,
    p_room_id: d.roomId,
    p_starts_at: d.startsAt,
    p_ends_at: d.endsAt,
  });
  if (error) return { ok: false, error: errorText(error.message) };
  return done();
}
