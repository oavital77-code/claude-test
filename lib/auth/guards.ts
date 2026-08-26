import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * טעינת המשתמש המחובר + הפרופיל שלו, פעם אחת לכל בקשה.
 *
 * `cache()` של React מזהה שזו אותה קריאה בתוך אותו render ומחזיר את אותה
 * תוצאה — בלי זה כל עמוד משלם פעמיים: פעם ב-layout ופעם ב-page עצמו,
 * כשכל פעם היא round-trip ל-Auth של Supabase (getUser תמיד יוצא לרשת)
 * ועוד select על profiles. ה-middleware רץ ב-runtime נפרד ולא נכלל בקאש הזה.
 */
const loadAuthState = cache(async (): Promise<{
  userId: string | null;
  profile: Profile | null;
}> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { userId: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { userId: user.id, profile: profile ?? null };
});

/**
 * דורש session מחובר + פרופיל קיים. משתמש בלי session → /login.
 * משתמש עם session אך בלי פרופיל (עדיין באמצע ההרשמה) → /login (ימשיך משם).
 * משתמש מושעה → /suspended.
 */
export async function requireTherapistProfile(): Promise<{
  userId: string;
  profile: Profile;
}> {
  const { userId, profile } = await loadAuthState();

  if (!userId || !profile) redirect("/login");
  if (profile.status === "suspended") redirect("/suspended");

  return { userId, profile };
}

/** דורש session מחובר עם role='admin'. אחרת → /login (ה-UI לא מציע כניסת אדמין נפרדת — ר' spec §9). */
export async function requireAdmin(): Promise<{ userId: string; profile: Profile }> {
  const { userId, profile } = await requireTherapistProfile();
  if (profile.role !== "admin") redirect("/login");
  return { userId, profile };
}

/** בשימוש בעמוד ה-login עצמו: session קיים? יש כבר פרופיל? */
export async function getAuthState(): Promise<{
  userId: string | null;
  profile: Profile | null;
}> {
  return loadAuthState();
}
