import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/resend";
import {
  wooPurchaseReceivedEmail,
  sessionRenewedEmail,
  wooPaymentUnmatchedAdminEmail,
} from "@/lib/email/templates";
import { getAdminEmails } from "@/lib/email/recipients";
import { toE164Israel } from "@/lib/phone";
import { aggregatePurchaseRows, effectiveProductId, lineItemAmount } from "./line-items";
import type { Database } from "@/lib/supabase/types";

// לוגיקת עיבוד הזמנת Woo — משותפת בין שני נתיבי כניסה: ה-webhook (POST push
// מ-Woo, כשמוגדר) והבדיקה היזומה/ה-cron (pull דרך ה-REST API, כשאין webhook —
// ר' lib/woo/rest-client.ts). שני הנתיבים מזינים אותה הזמנה אמיתית מ-Woo
// לאותה פונקציה, כדי שההתנהגות תהיה זהה בלי קשר לאיך שהיא התגלתה.
export interface WooOrderPayload {
  id: number;
  status: string;
  billing?: {
    email?: string;
    phone?: string;
  };
  line_items?: Array<{
    product_id: number;
    variation_id?: number;
    quantity: number;
    total: string;
    total_tax?: string;
  }>;
}

export const PAID_STATUSES = new Set(["processing", "completed"]);

export async function processWooOrder(
  supabase: SupabaseClient<Database>,
  order: WooOrderPayload,
): Promise<{ ok: boolean; skipped?: string }> {
  if (!order.id) {
    return { ok: false, skipped: "MISSING_ORDER_ID" };
  }

  // רק הזמנה ששולמה בפועל בצד Woo יוצרת רכישה ממתינה. שינויים לסטטוסים
  // אחרים (pending, cancelled, refunded, failed...) מתעלמים.
  if (!PAID_STATUSES.has(order.status)) {
    return { ok: true, skipped: "NOT_PAID" };
  }

  const rawPhone = order.billing?.phone;
  const email = order.billing?.email?.trim().toLowerCase() || null;
  const phone = rawPhone ? toE164Israel(rawPhone) : null;
  if (!phone && !email) {
    return { ok: false, skipped: "MISSING_CONTACT_INFO" };
  }

  const lineItems = order.line_items ?? [];
  if (lineItems.length === 0) {
    return { ok: true, skipped: "NO_LINE_ITEMS" };
  }

  const { data: sessionProductSetting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "woo_session_product_id")
    .maybeSingle();
  const sessionProductId = typeof sessionProductSetting?.value === "number" ? sessionProductSetting.value : 0;

  let sessionHandled = false;
  if (sessionProductId) {
    const sessionItem = lineItems.find((li) => effectiveProductId(li) === sessionProductId);
    if (sessionItem) {
      const amountTotal = lineItemAmount(sessionItem);
      if (amountTotal !== null) {
        await activateSessionFromWooOrder(supabase, {
          phone,
          email,
          wooOrderId: order.id,
          amountTotal,
        });
        sessionHandled = true;
      }
    }
  }

  const { data: mappings } = await supabase
    .from("woo_product_tiers")
    .select("woo_product_id, tier_id")
    .in(
      "woo_product_id",
      lineItems.map((li) => effectiveProductId(li)),
    );

  if (!mappings || mappings.length === 0) {
    return sessionHandled ? { ok: true } : { ok: true, skipped: "NO_MAPPED_PRODUCTS" };
  }

  const { data: tiers } = await supabase
    .from("punch_card_tiers")
    .select("id, hours")
    .in(
      "id",
      mappings.map((m) => m.tier_id),
    );

  // איחוד לפי מדרגה לפני הכתיבה — שתי שורות מאותה מדרגה באותה הזמנה חייבות
  // להפוך לשורה אחת, אחרת ה-upsert זורק את השנייה בשקט (ר' line-items.ts).
  const aggregated = aggregatePurchaseRows(lineItems, mappings);
  const rowsToInsert = aggregated.map((row) => ({
    woo_order_id: order.id,
    tier_id: row.tier_id,
    phone,
    email,
    quantity: row.quantity,
    amount_total: row.amount_total,
  }));

  if (rowsToInsert.length === 0) {
    return sessionHandled ? { ok: true } : { ok: true, skipped: "NO_MAPPED_PRODUCTS" };
  }

  // onConflict + ignoreDuplicates: אידמפוטנטי מול אותה הזמנה שמתגלה כמה
  // פעמים (webhook כפול, או כמה ריצות poll חופפות על אותו חלון זמן — זה
  // המצב הרגיל כל עוד אין webhook בחנות, ר' חוק ברזל #6). ה-.select() אחרי
  // ה-upsert חיוני: שורה שהתנגשה (כבר קיימת) לא חוזרת ב-RETURNING, אז
  // insertedRows מכיל רק שורות שבאמת נכתבו עכשיו בפעם הראשונה — המייל
  // צריך להישלח פעם אחת בלבד לכל (woo_order_id, tier_id), לא בכל פולינג.
  const { data: insertedRows, error } = await supabase
    .from("woo_pending_purchases")
    .upsert(rowsToInsert, { onConflict: "woo_order_id,tier_id", ignoreDuplicates: true })
    .select("tier_id, quantity");

  if (error) {
    return { ok: false, skipped: "SAVE_FAILED" };
  }

  const newHours = (insertedRows ?? []).reduce((sum, row) => {
    const tier = tiers?.find((t) => t.id === row.tier_id);
    return sum + (tier ? tier.hours * row.quantity : 0);
  }, 0);

  if (email && newHours > 0) {
    const registerUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login`;
    const { subject, html } = wooPurchaseReceivedEmail({ hours: newHours, registerUrl });
    sendEmail({ to: email, subject, html }).catch(() => {});
  }

  return { ok: true };
}

// ═══ ססיה: מטפל/ת עם חשבון קיים — התשלום מותאם ישירות לתשלום הממתין שלו/ה,
// לא דרך "רכישה ממתינה" (בניגוד לכרטיסייה, שיכולה להיקנות לפני שיש חשבון).
// אידמפוטנטי דרך activate_session_payment/finalize_session_renewal עצמם
// (בודקים status='paid' לפני כתיבה) — קריאה כפולה על אותה הזמנה היא no-op,
// כי אחרי ההפעלה הראשונה התשלום הממתין כבר לא יימצא ב-status='pending'. ═══
async function activateSessionFromWooOrder(
  supabase: SupabaseClient<Database>,
  params: { phone: string | null; email: string | null; wooOrderId: number; amountTotal: number },
) {
  let profile: { id: string; email: string } | null = null;

  if (params.phone) {
    const { data } = await supabase.from("profiles").select("id, email").eq("phone", params.phone).maybeSingle();
    profile = data;
  }
  if (!profile && params.email) {
    const { data } = await supabase.from("profiles").select("id, email").eq("email", params.email).maybeSingle();
    profile = data;
  }
  if (!profile) {
    // אין עדיין חשבון Cleana תואם. בניגוד לכרטיסייה (שנשמרת כרכישה ממתינה
    // ומחכה להרשמה), לססיה אין מנגנון כזה — התשלום פשוט לא משויך לאף אחד.
    await alertPaymentUnmatched(supabase, {
      wooOrderId: params.wooOrderId,
      reason: "לא נמצא חשבון מטפל/ת תואם לטלפון או למייל שבהזמנה",
    });
    return;
  }

  const transactionUid = `woo-session-${params.wooOrderId}`;

  const { data: initialPayment } = await supabase
    .from("payments")
    .select("id, amount_total")
    .eq("user_id", profile.id)
    .eq("type", "session_initial")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (initialPayment) {
    if (Math.abs(initialPayment.amount_total - params.amountTotal) > 0.01) {
      await alertPaymentUnmatched(supabase, {
        wooOrderId: params.wooOrderId,
        reason: "הסכום ששולם אינו תואם לתשלום הססיה הממתין",
        expected: initialPayment.amount_total,
        received: params.amountTotal,
      });
      return;
    }
    await supabase.rpc("activate_session_payment", {
      p_payment_id: initialPayment.id,
      p_transaction_uid: transactionUid,
      p_method: "other",
      p_token_uid: null,
    });
    return;
  }

  const { data: renewalPayment } = await supabase
    .from("payments")
    .select("id, amount_total")
    .eq("user_id", profile.id)
    .eq("type", "session_recurring")
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!renewalPayment) {
    await alertPaymentUnmatched(supabase, {
      wooOrderId: params.wooOrderId,
      reason: "נמצא חשבון, אך אין לו תשלום ססיה ממתין (ראשוני או חידוש)",
    });
    return;
  }
  if (Math.abs(renewalPayment.amount_total - params.amountTotal) > 0.01) {
    await alertPaymentUnmatched(supabase, {
      wooOrderId: params.wooOrderId,
      reason: "הסכום ששולם אינו תואם לחידוש הססיה הממתין",
      expected: renewalPayment.amount_total,
      received: params.amountTotal,
    });
    return;
  }

  await supabase.rpc("finalize_session_renewal", {
    p_payment_id: renewalPayment.id,
    p_success: true,
    p_transaction_uid: transactionUid,
  });

  const { subject, html } = sessionRenewedEmail(params.amountTotal, null);
  sendEmail({ to: profile.email, subject, html }).catch(() => {});
}

/**
 * תשלום שהתקבל בחנות ולא הצליח להשתייך לתשלום ממתין הוא כשל שקט מסוכן:
 * הכסף נגבה, השירות לא הופעל, ואף אחד לא יודע — המטפל/ת תגלה את זה רק
 * ביום ההגעה לקליניקה. המסלול העיקרי לגילוי תשלומים הוא after() בטעינת
 * עמוד, שעטוף ב-catch(() => {}), אז בלי ההתראה הזו אין שום עקבה.
 */
async function alertPaymentUnmatched(
  supabase: SupabaseClient<Database>,
  params: { wooOrderId: number; reason: string; expected?: number; received?: number },
) {
  console.error(`[woo] תשלום לא שויך — הזמנה ${params.wooOrderId}: ${params.reason}`);
  try {
    const adminEmails = await getAdminEmails(supabase);
    if (adminEmails.length === 0) return;
    const { subject, html } = wooPaymentUnmatchedAdminEmail(params);
    await sendEmail({ to: adminEmails, subject, html });
  } catch {
    // ההתראה היא best-effort — כישלון בשליחתה לא אמור להפיל את עיבוד ההזמנה.
  }
}
