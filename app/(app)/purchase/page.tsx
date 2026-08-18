import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { PurchaseClient } from "./purchase-client";

export default async function PurchasePage() {
  await requireTherapistProfile();
  const supabase = await createClient();

  const [{ data: tiers }, { data: vatSetting }] = await Promise.all([
    supabase.from("punch_card_tiers").select("*").eq("active", true).order("sort_order"),
    supabase.from("app_settings").select("value").eq("key", "vat_rate").maybeSingle(),
  ]);

  const vatRate = typeof vatSetting?.value === "number" ? vatSetting.value : 0.18;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">רכישת כרטיסייה</h1>
      <PurchaseClient tiers={tiers ?? []} vatRate={vatRate} />
    </div>
  );
}
