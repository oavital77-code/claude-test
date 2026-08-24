"use server";

import { createClient } from "@/lib/supabase/server";
import { detailsFormSchema } from "@/lib/validation/registration";
import { TERMS_VERSION } from "@/lib/terms/current";
import { toE164Israel } from "@/lib/phone";

export type CompleteRegistrationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function completeRegistration(
  formValues: unknown,
  termsAccepted: boolean,
): Promise<CompleteRegistrationResult> {
  if (!termsAccepted) {
    return { ok: false, error: "יש לאשר את תקנון השירות" };
  }

  const parsed = detailsFormSchema.safeParse(formValues);
  if (!parsed.success) {
    return { ok: false, error: "פרטים לא תקינים — יש לבדוק את הטופס" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return { ok: false, error: "יש לאמת כתובת מייל לפני המשך ההרשמה" };
  }

  const { full_name, phone, national_id, profession, business_number } = parsed.data;
  const phoneE164 = toE164Israel(phone);
  if (!phoneE164) {
    return { ok: false, error: "מספר טלפון לא תקין" };
  }

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    phone: phoneE164,
    full_name,
    email: user.email,
    national_id: national_id || null,
    profession,
    business_number: business_number || null,
    terms_accepted_at: new Date().toISOString(),
    terms_version: TERMS_VERSION,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "מספר הטלפון כבר רשום במערכת" };
    }
    return { ok: false, error: "שגיאה בשמירת הפרטים. נסו שוב." };
  }

  // הפעלה אוטומטית של רכישות ממתינות מחנות ה-Woo (אם נרשמו באותו טלפון/מייל).
  // best-effort בכוונה: כישלון כאן לא אמור לחסום הרשמה שכבר הצליחה — אם לא
  // הופעל, זה יישאר בטבלה ל-admin לטפל ידנית.
  try {
    await supabase.rpc("claim_woo_pending_purchase");
  } catch {
    // מתועד ע"י Supabase/הלוגים; לא חוסם את ההרשמה עצמה.
  }

  return { ok: true };
}
