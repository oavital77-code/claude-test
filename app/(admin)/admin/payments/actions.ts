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

  const transactionUid = `MANUAL-${Date.now()}`;

  // חידוש ססיה של מנוי שהופעל במזומן (בלי טוקן כרטיס) נכשל אוטומטית ב-
  // charge-renewals cron בכל חודש ("אין כרטיס שמור") — מגיע ל-status='failed',
  // לא 'pending'. נתיב נפרד שמטפל גם במצב הזה, לא רק בממתין.
  if (payment.type === "session_recurring" && payment.status === "failed") {
    const { error } = await supabase.rpc("admin_mark_session_recurring_paid_cash", {
      p_payment_id: paymentId,
      p_method: "cash",
      p_transaction_uid: transactionUid,
    });
    if (error) return { ok: false, error: "עדכון החידוש נכשל" };
    return { ok: true };
  }

  if (payment.status !== "pending") return { ok: false, error: "התשלום כבר טופל" };

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
    // תשלום מזומן: אין טוקן כרטיס לשמור, ולכן החידושים החודשיים הבאים לא
    // ייגבו אוטומטית — יגיעו ל-status='failed' מדי חודש, ואפשר לסמן אותם
    // כשולם ידנית באותה רשימה (ר' הענף למעלה).
    const { error } = await supabase.rpc("admin_activate_session_cash_payment", {
      p_payment_id: paymentId,
      p_method: "cash",
      p_transaction_uid: transactionUid,
    });
    if (error) return { ok: false, error: "הפעלת הססיה נכשלה" };
    return { ok: true };
  }

  return { ok: false, error: "סוג תשלום זה אינו נתמך לסימון ידני" };
}
