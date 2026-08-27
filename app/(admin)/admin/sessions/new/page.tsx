import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { AdminSessionWizard } from "./admin-session-wizard";

export default async function AdminNewSessionPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: rooms }, { data: branches }, { data: settings }, { data: therapists }] = await Promise.all([
    supabase.from("rooms").select("id, name, branch_id").eq("active", true).order("sort_order"),
    supabase.from("branches").select("id, name").eq("active", true),
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["session_base_price", "session_base_hours"]),
    supabase.from("profiles").select("id, full_name, phone").eq("status", "active").order("full_name"),
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
      <h1 className="text-xl font-semibold">קביעת ססיה חופשית</h1>
      <p className="text-sm text-muted-foreground">
        קביעה ישירה ע״י אדמין — ללא בדיקת התנגשות משבצות. עדיין עובר תשלום רגיל בחנות.
      </p>
      <AdminSessionWizard
        roomOptions={roomOptions}
        therapists={therapists ?? []}
        basePrice={basePrice}
        baseHours={baseHours}
      />
    </div>
  );
}
