"use server";

import { revalidatePath } from "next/cache";
import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { profileEditSchema } from "@/lib/validation/profile";
import { deleteCleanaPlusConnection, getCleanaPlusToken } from "@/lib/cleana-plus/connection";
import { cleanaPlusConfig, revokeToken } from "@/lib/cleana-plus/oauth";

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

/**
 * עדכון הכרטיס האישי ע"י המטפל/ת עצמו/ה.
 *
 * 🔒 מה מותר לערוך: full_name, profession, business_number בלבד.
 *
 * טלפון ומייל *לא* ניתנים לעריכה עצמית, וזו לא החמרה שרירותית: הם מפתח
 * ההתאמה של claim_woo_pending_purchase, שמזכה רכישה ששולמה בחנות לפי
 * phone/email. מי שיכול לשנות אותם לערך של אדם אחר יכול לגנוב רכישה
 * ששולמה. ר' המיגרציה 20260828000008 — ה-trigger
 * enforce_profile_privilege_columns מחזיר את שני השדות לערכם הקודם גם
 * בקריאה ישירה ל-PostgREST, כך שההגבלה כאן היא UX, לא ההגנה עצמה.
 *
 * שינוי טלפון/מייל/ת״ז — דרך אדמין, שאינו כפוף ל-trigger.
 */
export async function updateOwnProfile(formValues: unknown): Promise<UpdateProfileResult> {
  const { userId } = await requireTherapistProfile();

  const parsed = profileEditSchema.safeParse(formValues);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "פרטים לא תקינים" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      profession: parsed.data.profession,
      business_number: parsed.data.business_number || null,
    })
    .eq("id", userId);

  if (error) {
    return { ok: false, error: "שמירת הפרטים נכשלה. נסו שוב." };
  }

  revalidatePath("/profile");
  return { ok: true };
}

export type DisconnectCleanaPlusResult = { ok: true } | { ok: false; error: string };

/**
 * ניתוק Cleana+ מצד Cleana. מבטל את המפתח ב-Cleana+ (best-effort) ומוחק
 * אותו אצלנו. גם אם Cleana+ לא עונה — המפתח נמחק כאן, כך שאף אחד לא מחזיק בו.
 */
export async function disconnectCleanaPlus(): Promise<DisconnectCleanaPlusResult> {
  const { userId } = await requireTherapistProfile();

  const token = await getCleanaPlusToken(userId);
  const config = cleanaPlusConfig();
  if (token && config) await revokeToken(config, token);

  const deleted = await deleteCleanaPlusConnection(userId);
  if (!deleted) return { ok: false, error: "הניתוק נכשל. נסו שוב." };

  revalidatePath("/profile");
  return { ok: true };
}
