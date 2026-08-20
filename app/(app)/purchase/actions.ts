"use server";

import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { generatePaymentLink } from "@/lib/payplus/client";

export type PurchaseResult = { ok: true; redirectUrl: string } | { ok: false; error: string };

export async function initiatePunchCardPurchase(tierId: string): Promise<PurchaseResult> {
  const { profile } = await requireTherapistProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("create_punch_card_purchase", { p_tier_id: tierId })
    .single();

  if (error || !data) {
    return { ok: false, error: "יצירת בקשת הרכישה נכשלה. נסו שוב." };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const link = await generatePaymentLink({
      amountTotal: data.amount_total,
      customerName: profile.full_name,
      customerEmail: profile.email,
      customerPhone: profile.phone,
      itemName: "רכישת כרטיסייה — בקליניקה",
      moreInfo: data.payment_id,
      successUrl: `${baseUrl}/purchase/success?payment_id=${data.payment_id}`,
      failureUrl: `${baseUrl}/purchase/failure?payment_id=${data.payment_id}`,
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
