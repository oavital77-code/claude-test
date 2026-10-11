import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * שיוך הזמנת Woo לחשבון Cleana קיים — לפי מייל בלבד.
 *
 * לא לפי טלפון: הטלפון בפרופיל מוזן בהרשמה בלי אימות (אין OTP), כך שמי
 * שמזין/ה טלפון של אחר/ת היה/תה מקבל/ת את התשלום שלו/ה. המייל, לעומת זאת,
 * נעול למייל המאומת מ-auth.users (trigger enforce_profile_privilege_columns,
 * ר' 20261011000002). הזמנה בלי מייל תואם → null → התראה לאדמין לשיוך ידני.
 *
 * קובץ נפרד מ-process-order.ts (בלי "server-only") כדי שיהיה ניתן לבדיקה.
 */
export async function findProfileByVerifiedEmail(
  supabase: Pick<SupabaseClient<Database>, "from">,
  email: string | null,
): Promise<{ id: string; email: string } | null> {
  if (!email) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  return data;
}
