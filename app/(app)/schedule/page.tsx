import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { fetchBranches } from "@/lib/availability/queries";
import { ScheduleClient } from "./schedule-client";

export default async function SchedulePage() {
  const { userId, profile } = await requireTherapistProfile();
  const supabase = await createClient();
  const branches = await fetchBranches(supabase);

  return (
    <div className="flex min-w-0 flex-1 flex-col p-4">
      <h1 className="mb-4 text-xl font-semibold">לוח זמנים</h1>
      <ScheduleClient branches={branches} userId={userId} fullName={profile.full_name} />
    </div>
  );
}
