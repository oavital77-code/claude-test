import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { SessionRequestWizard } from "./session-request-wizard";

export default async function NewSessionRequestPage() {
  await requireTherapistProfile();
  const supabase = await createClient();

  const [{ data: rooms }, { data: branches }, { data: settings }] = await Promise.all([
    supabase.from("rooms").select("id, name, branch_id").eq("active", true).order("sort_order"),
    supabase.from("branches").select("id, name").eq("active", true),
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["session_base_price", "session_base_hours"]),
  ]);

  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const roomOptions = (rooms ?? []).map((r) => ({
    id: r.id,
    label: `${r.name} · ${branchNameById.get(r.branch_id) ?? ""}`,
  }));

  const settingsMap = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));
  const basePrice = typeof settingsMap.session_base_price === "number" ? settingsMap.session_base_price : 600;
  const baseHours = typeof settingsMap.session_base_hours === "number" ? settingsMap.session_base_hours : 5;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">בקשת ססיה חדשה</h1>
      <SessionRequestWizard roomOptions={roomOptions} basePrice={basePrice} baseHours={baseHours} />
    </div>
  );
}
