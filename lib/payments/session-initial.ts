import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { generatePaymentLink } from "@/lib/payplus/client";

export type SessionPaymentLinkResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string };

/**
 * יוצר בקשת תשלום ראשוני לססיה + דף תשלום ב-PayPlus. משותף בין הפעלת
 * "מעבר לתשלום" ע"י המטפל לבין יצירת הקישור מיידית ע"י האדמין באישור
 * (כדי לשלוח אותו במייל, §3.3) — שני המסלולים עוברים דרך אותו RPC,
 * שתומך גם בקריאה מהמטפל וגם מהאדמין בשמו (ר' 20260824000002).
 */
export async function createSessionInitialPaymentLink(
  supabase: SupabaseClient<Database>,
  subscriptionId: string,
  customer: { fullName: string; email: string; phone: string },
): Promise<SessionPaymentLinkResult> {
  const { data, error } = await supabase
    .rpc("create_session_initial_payment", { p_subscription_id: subscriptionId })
    .single();

  if (error || !data) {
    return { ok: false, error: "יצירת בקשת התשלום נכשלה. נסו שוב." };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const link = await generatePaymentLink({
      amountTotal: data.amount_total,
      customerName: customer.fullName,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      itemName: "מנוי ססיה — בקליניקה",
      moreInfo: data.payment_id,
      successUrl: `${baseUrl}/sessions?payment=success`,
      failureUrl: `${baseUrl}/sessions?payment=failure`,
      callbackUrl: `${baseUrl}/api/payplus/callback`,
    });

    await supabase.rpc("set_payment_page_uid", {
      p_payment_id: data.payment_id,
      p_page_uid: link.pageRequestUid,
    });

    return { ok: true, redirectUrl: link.paymentPageLink };
  } catch {
    return { ok: false, error: "יצירת דף התשלום נכשלה. נסו שוב מאוחר יותר." };
  }
}

/**
 * חידוש ססיה יזום — המטפל/ת לוחצ/ת "חידוש" ומקבל/ת קישור תשלום טרי, בדיוק
 * כמו התשלום הראשוני. אין יותר חיוב אוטומטי בטוקן שמור (ר' migration
 * 20260828000002) — כל חידוש הוא פעולה מודעת של המטפל/ת.
 */
export async function createSessionRenewalPaymentLink(
  supabase: SupabaseClient<Database>,
  subscriptionId: string,
  customer: { fullName: string; email: string; phone: string },
): Promise<SessionPaymentLinkResult> {
  const { data, error } = await supabase
    .rpc("initiate_session_renewal_payment", { p_subscription_id: subscriptionId })
    .single();

  if (error || !data) {
    return { ok: false, error: "יצירת בקשת החידוש נכשלה. נסו שוב." };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const link = await generatePaymentLink({
      amountTotal: data.amount_total,
      customerName: customer.fullName,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      itemName: "חידוש מנוי ססיה — בקליניקה",
      moreInfo: data.payment_id,
      successUrl: `${baseUrl}/sessions?payment=success`,
      failureUrl: `${baseUrl}/sessions?payment=failure`,
      callbackUrl: `${baseUrl}/api/payplus/callback`,
    });

    await supabase.rpc("set_payment_page_uid", {
      p_payment_id: data.payment_id,
      p_page_uid: link.pageRequestUid,
    });

    return { ok: true, redirectUrl: link.paymentPageLink };
  } catch {
    return { ok: false, error: "יצירת דף התשלום נכשלה. נסו שוב מאוחר יותר." };
  }
}
