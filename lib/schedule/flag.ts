import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * מתג ללוח החדש (גרירה ומתיחה) ולהודעת "מה חדש" שמסבירה אותו, בלי העלאה:
 * app_settings.schedule_time_grid
 *   "all"                   → לכולם
 *   { "users": ["<uuid>"] } → רק למשתמשים האלה
 * כל ערך אחר, מפתח חסר או שגיאת קריאה → כבוי (הלוח הקיים, בלי הודעה).
 *
 * cache(): ה-layout וה-page של /schedule שואלים באותה בקשה — קריאה אחת ל-DB.
 */
export const timeGridEnabled = cache(async (userId: string): Promise<boolean> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("app_settings").select("value").eq("key", "schedule_time_grid").maybeSingle();
    const value = data?.value;
    if (value === "all") return true;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const users = (value as { users?: unknown }).users;
      return Array.isArray(users) && users.includes(userId);
    }
    return false;
  } catch {
    return false;
  }
});
