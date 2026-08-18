"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

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
  await requireAdmin();
  const parsed = profileFieldsSchema.safeParse(formValues);
  if (!parsed.success) return { ok: false, error: "פרטים לא תקינים" };

  const supabase = await createClient();
  const { full_name, email, profession, business_number, door_code, admin_notes } = parsed.data;

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name,
      email,
      profession: profession || null,
      business_number: business_number || null,
      door_code: door_code || null,
      admin_notes: admin_notes || null,
    })
    .eq("id", userId);

  if (error) return { ok: false, error: "השמירה נכשלה" };
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
