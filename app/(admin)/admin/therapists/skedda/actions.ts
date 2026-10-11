"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const optionalText = z.string().trim().max(500).optional().or(z.literal(""));

const rowSchema = z.object({
  id: z.guid(),
  full_name: z.string().trim().min(1, "יש להזין שם").max(200),
  email: z.string().trim().toLowerCase().email("מייל לא תקין").optional().or(z.literal("")),
  balance_hours: z
    .number()
    .min(-500)
    .max(1000)
    .refine((n) => Number.isInteger(n * 2), "שעות בקפיצות של חצי שעה")
    .nullable(),
  has_session: z.boolean(),
  session_details: optionalText,
  session_paid_until: z.iso.date().optional().or(z.literal("")),
  session_commitment: optionalText,
  admin_note: optionalText,
  status: z.enum(["pending", "skipped"]),
});

/**
 * עריכת שורה בטבלת ההעברה מ-Skedda (ר' 20261011000005). שורה שכבר הועברה
 * (status='transferred') לא ניתנת לעריכה — הכרטיסייה כבר נוצרה, ותיקון
 * נעשה בכרטיס המטפל/ת עצמו/ה.
 */
export async function updateSkeddaRowAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = rowSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "פרטים לא תקינים" };
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("skedda_migration")
    .update({
      full_name: d.full_name,
      email: d.email || null,
      balance_hours: d.balance_hours,
      has_session: d.has_session,
      session_details: d.session_details || null,
      session_paid_until: d.session_paid_until || null,
      session_commitment: d.session_commitment || null,
      admin_note: d.admin_note || null,
      status: d.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", d.id)
    .neq("status", "transferred")
    .select("id");

  if (error) {
    if (error.code === "23505") return { ok: false, error: "המייל הזה כבר משויך לשורה אחרת" };
    return { ok: false, error: "השמירה נכשלה" };
  }
  if (!data || data.length === 0) return { ok: false, error: "השורה כבר הועברה ולא ניתנת לעריכה" };

  revalidatePath("/admin/therapists/skedda");
  return { ok: true };
}

const newRowSchema = z.object({ full_name: z.string().trim().min(1, "יש להזין שם").max(200) });

/** הוספת מטפל/ת שלא הופיע/ה בייצוא (למשל בעלת ססיה שאין לה משתמש ב-Skedda). */
export async function addSkeddaRowAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = newRowSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "שם לא תקין" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("skedda_migration")
    .insert({ full_name: parsed.data.full_name, confidence: "review", note: "נוסף ידנית" });
  if (error) return { ok: false, error: "ההוספה נכשלה" };

  revalidatePath("/admin/therapists/skedda");
  return { ok: true };
}
