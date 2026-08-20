import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// 🔴 Service Role — עוקף RLS. אך ורק בקוד שרת: webhooks, cron, RPCs מיוחסים.
// לעולם לא לחשוף ל-client, לא ב-route handler שמחזיר תשובה למשתמש בלי בדיקת הרשאה.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
