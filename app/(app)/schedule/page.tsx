import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { fetchBranches } from "@/lib/availability/queries";
import { holidaysForSchedule } from "@/lib/holidays";
import { ScheduleClient } from "./schedule-client";

/**
 * מתג ללוח החדש (גרירה ומתיחה), בלי העלאה: app_settings.schedule_time_grid.
 *   "all"                  → לכולם
 *   { "users": ["<uuid>"] } → רק למשתמשים האלה
 * כל ערך אחר, מפתח חסר או שגיאת קריאה → הלוח הקיים. כיבוי = מחיקת השורה.
 */
async function timeGridEnabled(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  try {
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
}

export default async function SchedulePage() {
  const { userId, profile } = await requireTherapistProfile();
  const supabase = await createClient();
  const [branches, timeGrid] = await Promise.all([fetchBranches(supabase), timeGridEnabled(supabase, userId)]);

  return (
    <div className="flex min-w-0 flex-1 flex-col p-4">
      <h1 className="mb-4 text-xl font-semibold">לוח זמנים</h1>
      <ScheduleClient
        branches={branches}
        userId={userId}
        fullName={profile.full_name}
        holidays={holidaysForSchedule()}
        timeGrid={timeGrid}
      />
    </div>
  );
}
