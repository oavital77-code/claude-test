"use server";

import { createClient } from "@/lib/supabase/server";
import { detailsFormSchema } from "@/lib/validation/registration";
import { TERMS_VERSION } from "@/lib/terms/current";

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

  if (!user || !user.phone) {
    return { ok: false, error: "יש לאמת מספר טלפון לפני המשך ההרשמה" };
  }

  const { full_name, email, national_id, profession, business_number } = parsed.data;
  const phoneE164 = user.phone.startsWith("+") ? user.phone : `+${user.phone}`;

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    phone: phoneE164,
    full_name,
    email,
    national_id: national_id || null,
    profession,
    business_number: business_number || null,
    terms_accepted_at: new Date().toISOString(),
    terms_version: TERMS_VERSION,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "כתובת המייל כבר רשומה במערכת" };
    }
    return { ok: false, error: "שגיאה בשמירת הפרטים. נסו שוב." };
  }

  return { ok: true };
}
