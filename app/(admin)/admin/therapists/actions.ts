"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164Israel } from "@/lib/phone";
import { TERMS_VERSION } from "@/lib/terms/current";

const demoTherapistSchema = z.object({
  full_name: z.string().trim().min(2, "יש להזין שם מלא"),
  email: z.string().trim().email("כתובת מייל לא תקינה"),
  phone: z
    .string()
    .min(1, "יש להזין מספר טלפון")
    .refine((v) => toE164Israel(v) !== null, { message: "מספר טלפון לא תקין" }),
  profession: z.string().trim().min(2, "יש להזין תחום טיפול"),
  demo_hours: z.number().min(0).max(200),
});

export type CreateDemoTherapistResult =
  | { ok: true; loginUrl: string }
  | { ok: false; error: string };

/**
 * יוצר משתמש דמו מלא (auth.users + profiles) בלי לעבור דרך הרשמה עצמאית,
 * ומעניק לו שעות חינם (grant_bonus_hours — כרטיסייה עם מחיר/פיקדון 0, בלי
 * PayPlus בכלל). מחזיר קישור התחברות חד-פעמי (magic link) כדי שהאדמין יוכל
 * לפתוח אותו (למשל בחלון גלישה בסתר) ולהתחבר בפועל בתור המשתמש הזה.
 */
export async function createDemoTherapistAction(
  formValues: unknown,
): Promise<CreateDemoTherapistResult> {
  await requireAdmin();

  const parsed = demoTherapistSchema.safeParse(formValues);
  if (!parsed.success) {
    return { ok: false, error: "פרטים לא תקינים — יש לבדוק את הטופס" };
  }
  const { full_name, email, phone, profession, demo_hours } = parsed.data;
  const phoneE164 = toE164Israel(phone)!;

  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return { ok: false, error: "יצירת המשתמש נכשלה — ייתכן שהמייל כבר קיים במערכת" };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name,
    email,
    phone: phoneE164,
    profession,
    terms_accepted_at: new Date().toISOString(),
    terms_version: TERMS_VERSION,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    if (profileError.code === "23505") {
      return { ok: false, error: "מספר הטלפון כבר רשום במערכת" };
    }
    return { ok: false, error: "יצירת הפרופיל נכשלה" };
  }

  if (demo_hours > 0) {
    const supabase = await createClient();
    const { error: hoursError } = await supabase.rpc("grant_bonus_hours", {
      p_user_id: created.user.id,
      p_hours: demo_hours,
      p_note: "משתמש דמו — הוקצה אוטומטית ביצירה",
    });
    if (hoursError) {
      return { ok: false, error: "המשתמש נוצר אך הענקת השעות נכשלה — אפשר להעניק ידנית בעמוד שלו" };
    }
  }

  const headerList = await headers();
  const origin = `https://${headerList.get("host")}`;

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (linkError || !link) {
    return { ok: false, error: "המשתמש נוצר, אך יצירת קישור ההתחברות נכשלה" };
  }

  return { ok: true, loginUrl: link.properties.action_link };
}

export type GeneratePasswordResetLinkResult =
  | { ok: true; resetUrl: string }
  | { ok: false; error: string };

/**
 * מייצר קישור איפוס סיסמה חד-פעמי למטפל/ת קיימ/ת (לא קובע/משנה סיסמה
 * בעצמו) — לשימוש אדמין שרוצה לעזור למטפל/ת ששכח/ה סיסמה, בלי לדעת את
 * הסיסמה בפועל. אותו יעד בדיוק כמו איפוס עצמאי (auth/callback → /reset-password).
 */
export async function generatePasswordResetLinkAction(
  userId: string,
): Promise<GeneratePasswordResetLinkResult> {
  await requireAdmin();

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile) {
    return { ok: false, error: "מטפל/ת לא נמצא/ה" };
  }

  const headerList = await headers();
  const origin = `https://${headerList.get("host")}`;
  const next = encodeURIComponent("/reset-password");

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: profile.email,
    options: { redirectTo: `${origin}/auth/callback?next=${next}` },
  });
  if (linkError || !link) {
    return { ok: false, error: "יצירת קישור איפוס הסיסמה נכשלה" };
  }

  return { ok: true, resetUrl: link.properties.action_link };
}
