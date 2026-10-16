"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { formatInTimeZone } from "date-fns-tz";
import { he } from "date-fns/locale";
import { TIMEZONE } from "@/lib/time";
import { todayInIsrael } from "@/lib/availability/grid";
import { slotOccurrences } from "@/lib/sessions/occurrences";

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

export type SlotConflict = {
  kind: "room" | "self" | "block";
  date: string;
  time: string;
  roomName: string;
  who: string;
};

export type ConflictCheckResult = { ok: true; conflicts: SlotConflict[] } | { ok: false; error: string };

const SOURCE_LABELS: Record<string, string> = {
  punch_card: "כרטיסייה",
  session: "ססיה",
  admin_comp: "שיבוץ אדמין",
};

/**
 * בדיקה *לפני* שמירה: אילו הזמנות עתידיות (כל סוג, כל מטפל/ת) או חסימות
 * חדר מתנגשות עם המשבצות החדשות/המעודכנות. שום דבר לא נדרס גם בלי זה —
 * מפגש מתנגש פשוט לא נקבע — אבל כך האדמין רואה מראש ומחליט.
 * קלט: משבצות שבועיות (from/until) או טווח יחיד (הזזת מפגש).
 */
export async function checkSlotConflictsAction(input: unknown): Promise<ConflictCheckResult> {
  await requireAdmin();
  const parsed = z
    .object({
      slots: z
        .array(z.object({ roomId: z.string().uuid(), weekday: z.number().int().min(0).max(6), startTime: time, endTime: time }))
        .max(14)
        .optional(),
      from: date.optional(),
      until: date.nullable().optional(),
      single: z.object({ roomId: z.string().uuid(), startsAt: z.string().datetime(), endsAt: z.string().datetime() }).optional(),
      userId: z.string().uuid().optional(),
      excludeSubscriptionId: z.string().uuid().optional(),
      excludeBookingId: z.string().uuid().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "קלט לא תקין" };
  const d = parsed.data;

  const today = todayInIsrael();
  const ranges = d.single
    ? [{ room_id: d.single.roomId, starts_at: d.single.startsAt, ends_at: d.single.endsAt }]
    : slotOccurrences(d.slots ?? [], d.from ?? today, d.until ?? null, today).map((o) => ({
        room_id: o.roomId,
        starts_at: o.startsAt.toISOString(),
        ends_at: o.endsAt.toISOString(),
      }));
  if (ranges.length === 0) return { ok: true, conflicts: [] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_session_slot_conflicts", {
    p_ranges: ranges,
    p_user_id: d.userId ?? null,
    p_exclude_subscription_id: d.excludeSubscriptionId ?? null,
    p_exclude_booking_id: d.excludeBookingId ?? null,
  });
  if (error) return { ok: false, error: "בדיקת ההתנגשויות נכשלה" };

  const userIds = [...new Set((data ?? []).map((c) => c.other_user_id).filter((id): id is string => !!id))];
  const [{ data: profiles }, { data: rooms }] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    supabase.from("rooms").select("id, name"),
  ]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const roomById = new Map((rooms ?? []).map((r) => [r.id, r.name]));

  const conflicts = (data ?? [])
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((c) => {
      const start = new Date(c.starts_at);
      const end = new Date(c.ends_at);
      return {
        kind: c.kind as SlotConflict["kind"],
        date: formatInTimeZone(start, TIMEZONE, "EEEE dd/MM", { locale: he }),
        time: `${formatInTimeZone(start, TIMEZONE, "HH:mm")}–${formatInTimeZone(end, TIMEZONE, "HH:mm")}`,
        roomName: roomById.get(c.room_id) ?? "חדר",
        who:
          c.kind === "block"
            ? `חסימת חדר${c.block_reason ? ` · ${c.block_reason}` : ""}`
            : `${nameById.get(c.other_user_id ?? "") ?? "מטפל/ת"} · ${SOURCE_LABELS[c.source ?? ""] ?? ""}`,
      };
    });
  return { ok: true, conflicts };
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
