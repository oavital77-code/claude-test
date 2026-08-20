import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { queryPaymentStatus } from "@/lib/payplus/client";

// כל 15 דק' — משלים callback-ים שאבדו: תשלומים ב-pending מעל 15 דק' (spec §13).
// queryPaymentStatus אינו ממומש עדיין (ר' lib/payplus/client.ts) — עד שיאומת
// מול תיעוד PayPlus, ה-route הזה מזהה נכון את התשלומים התקועים אבל לא מצליח
// לשחזר אותם, ורק רושם זאת. זה מתועד ולא מוסתר: קריאה שנכשלת לא מפילה את
// שאר הבאטש.
export async function GET() {
  const supabase = createAdminClient();

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60_000).toISOString();

  const { data: stalePayments, error } = await supabase
    .from("payments")
    .select("id, payplus_page_uid, created_at")
    .eq("status", "pending")
    .lt("created_at", fifteenMinutesAgo);

  if (error) {
    return NextResponse.json({ error: "QUERY_FAILED" }, { status: 500 });
  }

  const results: { paymentId: string; outcome: string }[] = [];

  for (const payment of stalePayments ?? []) {
    if (!payment.payplus_page_uid) {
      results.push({ paymentId: payment.id, outcome: "no_page_uid" });
      continue;
    }

    try {
      const status = await queryPaymentStatus(payment.payplus_page_uid);
      if (status === "paid") {
        // ⚠️ ללא transaction_uid אמיתי מהתגובה של PayPlus אין דרך בטוחה להפעיל
        // את הכרטיסייה כאן — queryPaymentStatus צריך להחזיר גם אותו לפני שזה נסגר.
        results.push({ paymentId: payment.id, outcome: "reconciled_paid_needs_transaction_uid" });
      } else if (status === "failed") {
        await supabase.rpc("mark_payment_failed", {
          p_payment_id: payment.id,
          p_reason: "לא אושר ע\"י PayPlus (סנכרון תקופתי)",
        });
        results.push({ paymentId: payment.id, outcome: "marked_failed" });
      } else {
        results.push({ paymentId: payment.id, outcome: "still_pending" });
      }
    } catch (err) {
      results.push({
        paymentId: payment.id,
        outcome: `check_failed: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
  }

  return NextResponse.json({ checked: stalePayments?.length ?? 0, results });
}
