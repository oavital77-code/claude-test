"use server";

import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type PurchaseResult = { ok: true; redirectUrl: string } | { ok: false; error: string };

// רכישת כרטיסייה מתבצעת באתר בקליניקה (WooCommerce + PayPlus) — לא בתוך
// Cleana. אנחנו רק מפנים לשם עם המוצר הנכון כבר בעגלה. אחרי תשלום מוצלח,
// webhook (app/api/woo/webhook) יוצר "רכישה ממתינה", וזו מופעלת אוטומטית
// בהרשמה (completeRegistration) או בכניסה הבאה למי שכבר רשום/ה (ר' AppLayout).
export async function initiatePunchCardPurchase(tierId: string): Promise<PurchaseResult> {
  await requireTherapistProfile();
  const supabase = await createClient();

  const { data: mapping } = await supabase
    .from("woo_product_tiers")
    .select("woo_product_id")
    .eq("tier_id", tierId)
    .limit(1)
    .maybeSingle();

  if (!mapping) {
    return { ok: false, error: "לא ניתן לרכוש כרגע — יש לפנות להנהלה." };
  }

  const storeUrl = process.env.NEXT_PUBLIC_WOOCOMMERCE_STORE_URL ?? "https://baclinica.co.il";
  const redirectUrl = `${storeUrl}/checkout/?add-to-cart=${mapping.woo_product_id}&quantity=1`;

  return { ok: true, redirectUrl };
}
