import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/resend";
import { wooPurchaseReceivedEmail, sessionRenewedEmail } from "@/lib/email/templates";
import { toE164Israel } from "@/lib/phone";
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
  line_items?: Array<{ product_id: number; quantity: number; total: string; total_tax?: string }>;
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
    const sessionItem = lineItems.find((li) => li.product_id === sessionProductId);
    if (sessionItem) {
      const amountTotal = parseFloat(sessionItem.total) + parseFloat(sessionItem.total_tax ?? "0");
      if (Number.isFinite(amountTotal)) {
        await activateSessionFromWooOrder(supabase, {
          phone,
          email,
          wooOrderId: order.id,
          amountTotal: Math.round(amountTotal * 100) / 100,
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
      lineItems.map((li) => li.product_id),
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

  let totalHours = 0;
  const rowsToInsert: {
    woo_order_id: number;
    tier_id: string;
    phone: string | null;
    email: string | null;
    quantity: number;
    amount_total: number;
  }[] = [];

  for (const item of lineItems) {
    const mapping = mappings.find((m) => m.woo_product_id === item.product_id);
    if (!mapping) continue;
    const tier = tiers?.find((t) => t.id === mapping.tier_id);
    if (!tier) continue;

    // הסכום שנשמר הוא זה ש-Woo מדווח שבפועל שולם בשורה הזו (כולל מע"מ), לא
    // חישוב מחדש ממחיר המדרגה — ר' חוק ברזל #6 (מקור האמת לתשלום).
    const amountTotal = parseFloat(item.total) + parseFloat(item.total_tax ?? "0");
    if (!Number.isFinite(amountTotal)) continue;

    rowsToInsert.push({
      woo_order_id: order.id,
      tier_id: mapping.tier_id,
      phone,
      email,
      quantity: item.quantity,
      amount_total: Math.round(amountTotal * 100) / 100,
    });
    totalHours += tier.hours * item.quantity;
  }

  if (rowsToInsert.length === 0) {
    return sessionHandled ? { ok: true } : { ok: true, skipped: "NO_MAPPED_PRODUCTS" };
  }

  // onConflict + ignoreDuplicates: אידמפוטנטי מול אותה הזמנה שמתגלה כמה
  // פעמים (webhook כפול, או כמה ריצות poll חופפות על אותו חלון זמן).
  const { error } = await supabase
    .from("woo_pending_purchases")
    .upsert(rowsToInsert, { onConflict: "woo_order_id,tier_id", ignoreDuplicates: true });

  if (error) {
    return { ok: false, skipped: "SAVE_FAILED" };
  }

  if (email) {
    const registerUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login`;
    const { subject, html } = wooPurchaseReceivedEmail({ hours: totalHours, registerUrl });
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
  if (!profile) return;

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
    if (Math.abs(initialPayment.amount_total - params.amountTotal) > 0.01) return;
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

  if (!renewalPayment) return;
  if (Math.abs(renewalPayment.amount_total - params.amountTotal) > 0.01) return;

  await supabase.rpc("finalize_session_renewal", {
    p_payment_id: renewalPayment.id,
    p_success: true,
    p_transaction_uid: transactionUid,
  });

  const { subject, html } = sessionRenewedEmail(params.amountTotal, null);
  sendEmail({ to: profile.email, subject, html }).catch(() => {});
}
