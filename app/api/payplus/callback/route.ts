import { NextResponse } from "next/server";
import { verifyPayPlusCallback } from "@/lib/payplus/verify";
import { getPayPlusConfig } from "@/lib/payplus/config";
import { createAdminClient } from "@/lib/supabase/admin";

// 🔴 מקור האמת לתשלום. לא ה-redirect (§7.4). כל עדכון סטטוס עובר תמיד
// דרך אימות hash, ואז דרך RPC (SECURITY DEFINER) — לא כתיבה ישירה.
//
// ⚠️ צורת ה-payload כאן (השדות transaction_uid/more_info/status_code/amount/
// token_uid) מבוססת על התיאור הכללי ב-spec §7.3-7.4 ועל התבנית הנפוצה
// ב-webhooks של PayPlus. יש לאמת מול תיעוד ה-API הרשמי / Postman collection
// של PayPlus לפני production — כולל שם השדה המדויק לסטטוס הצלחה/כישלון,
// לאמצעי התשלום, ולטוקן שחוזר מעסקה עם create_token=true (ססיה, §7.2).
// עד אז, כל כשל בפענוח או באימות נכשל סגור (החזרת שגיאה, בלי להפעיל דבר).
interface PayPlusCallbackPayload {
  transaction_uid: string;
  status_code: string; // "000" מייצג הצלחה בתיעוד הכללי של PayPlus — לאמת
  more_info: string; // payment_id שלנו
  amount: number;
  payment_method?: "credit_card" | "bit" | "paybox";
  invoice_url?: string;
  status_description?: string;
  token_uid?: string; // רק כשהעסקה נוצרה עם create_token=true (ססיה)
  card_last4?: string;
  card_expiry?: string;
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const config = getPayPlusConfig();
  const verified = verifyPayPlusCallback(rawBody, request.headers, config.secretKey);
  if (!verified) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  let payload: PayPlusCallbackPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  if (!payload.more_info || !payload.transaction_uid) {
    return NextResponse.json({ error: "MISSING_PAYMENT_REFERENCE" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const paymentId = payload.more_info;

  const { data: payment, error: fetchError } = await supabase
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();

  if (fetchError || !payment) {
    return NextResponse.json({ error: "PAYMENT_NOT_FOUND" }, { status: 404 });
  }

  // הגנת עומק: הסכום שחזר מ-PayPlus חייב להתאים לסכום שיצרנו — לא רק more_info.
  if (Math.abs(payment.amount_total - payload.amount) > 0.01) {
    return NextResponse.json({ error: "AMOUNT_MISMATCH" }, { status: 400 });
  }

  const succeeded = payload.status_code === "000";

  if (!succeeded) {
    await supabase.rpc("mark_payment_failed", {
      p_payment_id: paymentId,
      p_reason: payload.status_description ?? "לא צוינה סיבה",
    });
    return NextResponse.json({ ok: true });
  }

  if (payment.type === "punch_card") {
    const { error } = await supabase.rpc("activate_punch_card_payment", {
      p_payment_id: paymentId,
      p_transaction_uid: payload.transaction_uid,
      p_method: payload.payment_method ?? "credit_card",
      p_invoice_url: payload.invoice_url ?? null,
    });
    if (error) {
      return NextResponse.json({ error: "ACTIVATION_FAILED" }, { status: 500 });
    }
  } else if (payment.type === "session_initial") {
    if (!payload.token_uid) {
      // ססיה חייבת כרטיס אשראי + טוקן שמור (§7.2) — בלי טוקן אין חידוש אפשרי.
      return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });
    }
    const { error } = await supabase.rpc("activate_session_payment", {
      p_payment_id: paymentId,
      p_transaction_uid: payload.transaction_uid,
      p_method: payload.payment_method ?? "credit_card",
      p_token_uid: payload.token_uid,
      p_card_last4: payload.card_last4 ?? null,
      p_card_expiry: payload.card_expiry ?? null,
      p_invoice_url: payload.invoice_url ?? null,
    });
    if (error) {
      return NextResponse.json({ error: "ACTIVATION_FAILED" }, { status: 500 });
    }
  } else {
    // session_recurring מטופל דרך app/api/cron/charge-renewals, לא webhook נכנס.
    return NextResponse.json({ error: "UNEXPECTED_PAYMENT_TYPE" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
