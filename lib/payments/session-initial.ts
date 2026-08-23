import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type SessionPaymentLinkResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string };

async function wooSessionCheckoutUrl(supabase: SupabaseClient<Database>): Promise<string | null> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "woo_session_product_id")
    .maybeSingle();

  const productId = typeof data?.value === "number" ? data.value : 0;
  if (!productId) return null;

  const storeUrl = process.env.NEXT_PUBLIC_WOOCOMMERCE_STORE_URL ?? "https://baclinica.co.il";
  return `${storeUrl}/checkout/?add-to-cart=${productId}&quantity=1`;
}

/**
 * ססיה משולמת דרך חנות ה-Woo (baclinica-shop), בדיוק כמו כרטיסייה — מוצר
 * קבוע במחיר קבוע (§3.2, ססיה = מוצר בהיקף קבוע). יוצר את רשומת התשלום
 * הממתינה (pending) — משמשת גם לתיעוד/מסלול סימון-מזומן ידני באדמין — ואז
 * מפנה לדף הרכישה ב-Woo. אישור התשלום בפועל חוזר דרך app/api/woo/webhook,
 * לא דרך מסך זה. משותף בין הפעלת "מעבר לתשלום" ע"י המטפל לבין יצירת הקישור
 * מיידית ע"י האדמין באישור (כדי לשלוח אותו במייל, §3.3) — שני המסלולים
 * עוברים דרך אותו RPC (ר' 20260824000002).
 */
export async function createSessionInitialPaymentLink(
  supabase: SupabaseClient<Database>,
  subscriptionId: string,
): Promise<SessionPaymentLinkResult> {
  const { error } = await supabase
    .rpc("create_session_initial_payment", { p_subscription_id: subscriptionId })
    .single();

  if (error) {
    return { ok: false, error: "יצירת בקשת התשלום נכשלה. נסו שוב." };
  }

  const redirectUrl = await wooSessionCheckoutUrl(supabase);
  if (!redirectUrl) {
    return { ok: false, error: "מוצר הססיה בחנות טרם הוגדר — יש לפנות להנהלה." };
  }

  return { ok: true, redirectUrl };
}

/**
 * חידוש ססיה יזום — המטפל/ת לוחצ/ת "חידוש" ומקבל/ת קישור תשלום טרי באתר
 * בקליניקה, בדיוק כמו התשלום הראשוני. אין יותר חיוב אוטומטי בטוקן שמור
 * (ר' migration 20260828000002) — כל חידוש הוא פעולה מודעת של המטפל/ת.
 */
export async function createSessionRenewalPaymentLink(
  supabase: SupabaseClient<Database>,
  subscriptionId: string,
): Promise<SessionPaymentLinkResult> {
  const { error } = await supabase
    .rpc("initiate_session_renewal_payment", { p_subscription_id: subscriptionId })
    .single();

  if (error) {
    return { ok: false, error: "יצירת בקשת החידוש נכשלה. נסו שוב." };
  }

  const redirectUrl = await wooSessionCheckoutUrl(supabase);
  if (!redirectUrl) {
    return { ok: false, error: "מוצר הססיה בחנות טרם הוגדר — יש לפנות להנהלה." };
  }

  return { ok: true, redirectUrl };
}
