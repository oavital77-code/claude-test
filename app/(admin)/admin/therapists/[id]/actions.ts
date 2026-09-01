"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { bookingErrorMessage } from "@/lib/booking-errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

const profileFieldsSchema = z.object({
  full_name: z.string().trim().min(2),
  email: z.string().trim().email(),
  profession: z.string().trim().optional().or(z.literal("")),
  business_number: z.string().trim().optional().or(z.literal("")),
  door_code: z.string().trim().optional().or(z.literal("")),
  admin_notes: z.string().trim().optional().or(z.literal("")),
});

export async function updateTherapistProfile(
  userId: string,
  formValues: unknown,
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin();
  const parsed = profileFieldsSchema.safeParse(formValues);
  if (!parsed.success) return { ok: false, error: "פרטים לא תקינים" };

  const supabase = await createClient();
  const { full_name, email, profession, business_number, door_code, admin_notes } = parsed.data;

  const [{ error: profileError }, { error: notesError }] = await Promise.all([
    supabase
      .from("profiles")
      .update({
        full_name,
        email,
        profession: profession || null,
        business_number: business_number || null,
        door_code: door_code || null,
      })
      .eq("id", userId),
    // טבלה נפרדת עם RLS is_admin()-בלבד — ר' 20260825000003. אף מטפל לא
    // יכול לקרוא את השורה שלו-עצמו בטבלה הזו, בניגוד ל-profiles.
    supabase
      .from("therapist_admin_notes")
      .upsert({ user_id: userId, note: admin_notes || null, updated_by: adminId, updated_at: new Date().toISOString() }),
  ]);

  if (profileError || notesError) return { ok: false, error: "השמירה נכשלה" };
  return { ok: true };
}

export async function setTherapistStatus(
  userId: string,
  status: "active" | "suspended",
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
  if (error) return { ok: false, error: "העדכון נכשל" };
  return { ok: true };
}

export async function grantBonusHoursAction(
  userId: string,
  hours: number,
  note: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_bonus_hours", {
    p_user_id: userId,
    p_hours: hours,
    p_note: note,
  });
  if (error) return { ok: false, error: "הענקת השעות נכשלה" };
  return { ok: true };
}

export async function completeDepositAction(punchCardId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_complete_deposit", { p_punch_card_id: punchCardId });
  if (error) return { ok: false, error: "השלמת הפיקדון נכשלה" };
  return { ok: true };
}

export async function adjustPunchCardHoursAction(
  cardId: string,
  hoursDelta: number,
  note: string,
): Promise<ActionResult> {
  await requireAdmin();
  if (!hoursDelta) return { ok: false, error: "יש להזין כמות שעות שונה מאפס" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_adjust_punch_card_hours", {
    p_card_id: cardId,
    p_hours_delta: hoursDelta,
    p_note: note,
  });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  return { ok: true };
}

const sessionSlotSchema = z.object({
  subscriptionId: z.string().uuid(),
  roomId: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const claimSkeddaOneOffSchema = z.object({
  userId: z.string().uuid(),
  blockIds: z.array(z.string().uuid()).min(1),
});

export type ClaimSkeddaOneOffResult =
  | { ok: true; created: number; skipped: number }
  | { ok: false; error: string };

/**
 * קליטת בלוקים חד-פעמיים (כרטיסייה) שהועברו מ-Skedda: מוחקים את הבלוק
 * ויוצרים במקומו הזמנה אמיתית ל-user_id בפועל, בלי חיוב כרטיסייה
 * (admin_create_booking עם source='admin_comp') — היא כבר שילמה על התור
 * הזה במערכת הישנה. מופעים שכבר עברו רק נמחקים, בלי הזמנה חדשה.
 *
 * שונה מסלול ה"ססיה" (ר' SkeddaImportSection): שם לא מוחקים כלום כאן —
 * הניקוי קורה אוטומטית ב-DB ברגע שהתשלום מתקבל (cleanup_skedda_import_blocks).
 */
export async function claimSkeddaOneOffBlocksAction(input: unknown): Promise<ClaimSkeddaOneOffResult> {
  await requireAdmin();
  const parsed = claimSkeddaOneOffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "קלט לא תקין" };
  const { userId, blockIds } = parsed.data;

  const supabase = await createClient();
  const { data: blocks, error: fetchError } = await supabase
    .from("room_blocks")
    .select("id, room_id, starts_at, ends_at, reason")
    .in("id", blockIds);
  if (fetchError) return { ok: false, error: "שליפת החסימות נכשלה" };
  if (!blocks || blocks.length === 0) {
    return { ok: false, error: "החסימות שנבחרו כבר טופלו (אולי כבר נלחץ קודם)" };
  }

  const { error: deleteError } = await supabase.from("room_blocks").delete().in("id", blockIds);
  if (deleteError) return { ok: false, error: "מחיקת החסימות נכשלה" };

  let created = 0;
  let skipped = 0;
  const now = Date.now();
  const errors: string[] = [];

  for (const block of blocks) {
    if (new Date(block.starts_at).getTime() < now) {
      skipped += 1;
      continue;
    }
    const { error } = await supabase.rpc("admin_create_booking", {
      p_user_id: userId,
      p_room_id: block.room_id,
      p_starts_at: block.starts_at,
      p_ends_at: block.ends_at,
      p_note: "קליטה מ-Skedda",
    });
    if (error) {
      skipped += 1;
      errors.push(bookingErrorMessage(error.message));
    } else {
      created += 1;
    }
  }

  if (created === 0 && errors.length > 0) {
    return { ok: false, error: errors[0] };
  }
  return { ok: true, created, skipped };
}

export async function addSessionSlotAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = sessionSlotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "פרטי המשבצת לא תקינים" };
  const { subscriptionId, roomId, weekday, startTime, endTime } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_add_session_slot", {
    p_subscription_id: subscriptionId,
    p_room_id: roomId,
    p_weekday: weekday,
    p_start_time: `${startTime}:00`,
    p_end_time: `${endTime}:00`,
  });
  if (error) return { ok: false, error: bookingErrorMessage(error.message) };
  return { ok: true };
}
