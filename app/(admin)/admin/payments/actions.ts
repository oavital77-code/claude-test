"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function adminMarkPaidAction(paymentId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, type, status, user_id")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) return { ok: false, error: "התשלום לא נמצא" };
  if (payment.status !== "pending") return { ok: false, error: "התשלום כבר טופל" };

  const transactionUid = `MANUAL-${Date.now()}`;

  if (payment.type === "punch_card") {
    const { error } = await supabase.rpc("activate_punch_card_payment", {
      p_payment_id: paymentId,
      p_transaction_uid: transactionUid,
      p_method: "credit_card",
    });
    if (error) return { ok: false, error: "הפעלת הכרטיסייה נכשלה" };
    return { ok: true };
  }

  if (payment.type === "session_recurring") {
    const { error } = await supabase.rpc("finalize_session_renewal", {
      p_payment_id: paymentId,
      p_success: true,
      p_transaction_uid: transactionUid,
    });
    if (error) return { ok: false, error: "עדכון החידוש נכשל" };
    return { ok: true };
  }

  if (payment.type === "overrun") {
    const { error } = await supabase.rpc("finalize_overrun_charge", {
      p_payment_id: paymentId,
      p_success: true,
      p_transaction_uid: transactionUid,
    });
    if (error) return { ok: false, error: "עדכון החריגה נכשל" };
    return { ok: true };
  }

  if (payment.type === "session_initial") {
    return {
      ok: false,
      error: "לא ניתן לסמן ידנית תשלום ססיה ראשוני — נדרש כרטיס שמור מ-PayPlus לצורך חידושים עתידיים",
    };
  }

  return { ok: false, error: "סוג תשלום זה אינו נתמך לסימון ידני" };
}
