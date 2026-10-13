"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164Israel } from "@/lib/phone";

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

export type ProvisionRowResult = {
  id: string;
  name: string;
  ok: boolean;
  /** מה נעשה בפועל, או למה נכשל — מוצג לאדמין כמו שהוא. */
  message: string;
};

const provisionSchema = z.object({ rowIds: z.array(z.guid()).min(1).max(10) });

/**
 * פתיחת חשבונות Cleana מראש למטפלים מ-Skedda (בקבוצות קטנות — הלקוח קורא
 * שוב ושוב עד שהרשימה נגמרת, כדי לא לחרוג ממגבלת הזמן של פונקציה ב-Vercel).
 *
 * לכל שורה: יוצר משתמש (auth, מייל מאומת, בלי סיסמה — המטפל/ת קובע/ת דרך
 * "שכחתי סיסמה") + פרופיל בלי אישור תקנון (נדרש בכניסה הראשונה, ר'
 * requireTherapistProfile). אם כבר יש חשבון עם המייל — משתמש בו. אחר כך
 * מעביר את יתרת ה-Skedda (admin_transfer_skedda_balance) ומשייך רכישות
 * ממתינות מהחנות באותו מייל. ססיה לא נוצרת כאן — נשארת לקליטה מהחסימות.
 */
export async function provisionSkeddaAccountsAction(
  input: unknown,
): Promise<{ ok: true; results: ProvisionRowResult[] } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = provisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "קלט לא תקין" };

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: rows, error: rowsError } = await supabase
    .from("skedda_migration")
    .select("id, full_name, email, phone, balance_hours, status")
    .in("id", parsed.data.rowIds);
  if (rowsError || !rows) return { ok: false, error: "טעינת השורות נכשלה" };

  const results: ProvisionRowResult[] = [];
  for (const row of rows) {
    results.push(await provisionOne(supabase, admin, row));
  }
  revalidatePath("/admin/therapists/skedda");
  revalidatePath("/admin/therapists");
  return { ok: true, results };
}

async function provisionOne(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: ReturnType<typeof createAdminClient>,
  row: { id: string; full_name: string; email: string | null; phone: string | null; balance_hours: number | null; status: string },
): Promise<ProvisionRowResult> {
  const fail = (message: string): ProvisionRowResult => ({ id: row.id, name: row.full_name, ok: false, message });
  if (row.status !== "pending") return fail("השורה כבר טופלה");
  if (!row.email) return fail("חסר מייל");
  const email = row.email.trim().toLowerCase();

  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  let userId = existing?.id ?? null;
  const notes: string[] = [];

  if (!userId) {
    const phone = row.phone ? toE164Israel(row.phone) : null;
    if (!phone) return fail("חסר טלפון תקין");

    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (createError || !created.user) return fail("יצירת המשתמש נכשלה — ייתכן שהמייל כבר קיים בהרשמה חלקית");

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      full_name: row.full_name,
      email,
      phone,
      // terms_accepted_at נשאר ריק בכוונה: אישור אמיתי נדרש בכניסה הראשונה.
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return fail(profileError.code === "23505" ? "מספר הטלפון כבר רשום לחשבון אחר" : "יצירת הפרופיל נכשלה");
    }
    userId = created.user.id;
    notes.push("חשבון נפתח");
  } else {
    notes.push("חשבון קיים");
  }

  if (row.balance_hours !== null && row.balance_hours >= 0) {
    const { error } = await supabase.rpc("admin_transfer_skedda_balance", { p_row_id: row.id, p_user_id: userId });
    notes.push(error ? "העברת היתרה נכשלה" : `יתרה ${row.balance_hours} ש׳ הועברה`);
  } else {
    notes.push("יתרה לא הועברה (לא ידועה/שלילית)");
  }

  const { data: woo } = await supabase
    .from("woo_pending_purchases")
    .select("id, woo_order_id")
    .eq("status", "pending")
    .eq("email", email);
  for (const w of woo ?? []) {
    const { error } = await supabase.rpc("admin_assign_woo_pending_purchase", { p_pending_id: w.id, p_user_id: userId });
    notes.push(error ? `שיוך הזמנה ${w.woo_order_id} נכשל` : `הזמנה ${w.woo_order_id} מהחנות שויכה`);
  }

  return { id: row.id, name: row.full_name, ok: true, message: notes.join(" · ") };
}
