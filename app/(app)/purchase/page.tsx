import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { PurchaseClient } from "./purchase-client";

export default async function PurchasePage() {
  const { profile } = await requireTherapistProfile();
  const supabase = await createClient();

  const [{ data: tiers }, { data: vatSetting }] = await Promise.all([
    supabase.from("punch_card_tiers").select("*").eq("active", true).order("sort_order"),
    supabase.from("app_settings").select("value").eq("key", "vat_rate").maybeSingle(),
  ]);

  const vatRate = typeof vatSetting?.value === "number" ? vatSetting.value : 0.18;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">רכישת כרטיסייה</h1>
      <p className="text-sm text-muted-foreground">
        התשלום מתבצע באתר בקליניקה — הכרטיסייה תופעל אצלכם אוטומטית עם סיום התשלום.
      </p>
      {/* השיוך לחשבון הוא לפי המייל בלבד (אבטחה — ר' lib/woo/match-profile.ts),
          אז מייל אחר בקופה = הכרטיסייה לא מגיעה לבד. */}
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <p className="font-medium">חשוב: בתשלום יש להזין את אותו מייל שאיתו אתם נכנסים ל-Cleana:</p>
        <p className="mt-1 font-semibold" dir="ltr">
          {profile.email}
        </p>
        <p className="mt-1">
          אחרי התשלום חזרו ל-Cleana — הכרטיסייה תופיע תוך דקה-שתיים (אם לא, רעננו את העמוד).
        </p>
      </div>
      <PurchaseClient tiers={tiers ?? []} vatRate={vatRate} />
    </div>
  );
}
