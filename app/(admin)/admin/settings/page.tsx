import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";

const SETTING_LABELS: Record<string, string> = {
  vat_rate: "שיעור מע״מ (למשל 0.18)",
  buffer_minutes: "דקות חפיפה (buffer)",
  booking_horizon_days: "טווח הזמנה מראש (ימים)",
  cancel_window_hours: "חלון ביטול כרטיסייה (שעות)",
  sub_cancel_notice_days: "הודעה מראש לביטול ססיה (ימים)",
  session_base_price: "מחיר ססיה חודשי (₪, לפני מע״מ)",
  session_base_hours: "היקף ססיה קבוע (שעות שבועיות)",
  session_hold_hours: "תוקף hold לססיה (שעות)",
};

export default async function AdminSettingsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: settings }, { data: tiers }] = await Promise.all([
    supabase.from("app_settings").select("*").order("key"),
    supabase.from("punch_card_tiers").select("*").order("sort_order"),
  ]);

  const settingsWithLabels = (settings ?? [])
    .filter((s) => typeof s.value === "number")
    .map((s) => ({ key: s.key, value: s.value as number, label: SETTING_LABELS[s.key] ?? s.key }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">הגדרות</h1>
      <SettingsClient settings={settingsWithLabels} tiers={tiers ?? []} />
    </div>
  );
}
