import { NextResponse } from "next/server";
import { verifyWooWebhook } from "@/lib/woo/verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { wooPurchaseReceivedEmail } from "@/lib/email/templates";
import { toE164Israel } from "@/lib/phone";

// חנות ה-WooCommerce (baclinica-shop) מוכרת כרטיסיות למטפלים שעדיין אין להם
// חשבון Cleana. ה-webhook הזה הוא מקור האמת ל"שולם בפועל ב-Woo" — לא קורא ל-
// PayPlus בכלל (התשלום כבר קרה בגייטוויי של Woo). כל שהוא עושה: שומר "רכישה
// ממתינה" לפי טלפון/מייל, ושולח מייל עם קישור להרשמה/התחברות הרגילה ב-Cleana.
// ההפעלה בפועל (יצירת punch_card פעילה) קורית רק ב-claim_woo_pending_purchase,
// שנקראת אוטומטית מתוך completeRegistration — ר' app/(app)/login/actions.ts.
//
// ⚠️ צורת ה-payload כאן (order.id/status/billing/line_items) מבוססת על
// ה-WooCommerce REST API / Webhooks הסטנדרטי. יש לאמת מול הגדרות ה-webhook
// בפועל בחנות (Settings → Advanced → Webhooks) לפני production, כולל הנושא
// (topic) המדויק שנבחר (מומלץ "Order updated" כדי לתפוס מעבר ל-processing).
interface WooOrderPayload {
  id: number;
  status: string;
  billing?: {
    email?: string;
    phone?: string;
  };
  line_items?: Array<{ product_id: number; quantity: number; total: string; total_tax?: string }>;
}

const PAID_STATUSES = new Set(["processing", "completed"]);

export async function POST(request: Request) {
  const rawBody = await request.text();

  const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "WEBHOOK_NOT_CONFIGURED" }, { status: 500 });
  }
  if (!verifyWooWebhook(rawBody, request.headers, secret)) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  let order: WooOrderPayload;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  if (!order.id) {
    return NextResponse.json({ error: "MISSING_ORDER_ID" }, { status: 400 });
  }

  // רק הזמנה ששולמה בפועל בצד Woo יוצרת רכישה ממתינה. שינויים לסטטוסים
  // אחרים (pending, cancelled, refunded, failed...) מתעלמים — 200 כדי ש-Woo
  // לא ינסה שוב לשווא.
  if (!PAID_STATUSES.has(order.status)) {
    return NextResponse.json({ ok: true, skipped: "NOT_PAID" });
  }

  const rawPhone = order.billing?.phone;
  const email = order.billing?.email?.trim().toLowerCase() || null;
  const phone = rawPhone ? toE164Israel(rawPhone) : null;
  if (!phone && !email) {
    return NextResponse.json({ error: "MISSING_CONTACT_INFO" }, { status: 400 });
  }

  const lineItems = order.line_items ?? [];
  if (lineItems.length === 0) {
    return NextResponse.json({ ok: true, skipped: "NO_LINE_ITEMS" });
  }

  const supabase = createAdminClient();

  const { data: mappings } = await supabase
    .from("woo_product_tiers")
    .select("woo_product_id, tier_id")
    .in(
      "woo_product_id",
      lineItems.map((li) => li.product_id),
    );

  if (!mappings || mappings.length === 0) {
    return NextResponse.json({ ok: true, skipped: "NO_MAPPED_PRODUCTS" });
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
    return NextResponse.json({ ok: true, skipped: "NO_MAPPED_PRODUCTS" });
  }

  const { error } = await supabase
    .from("woo_pending_purchases")
    .upsert(rowsToInsert, { onConflict: "woo_order_id,tier_id", ignoreDuplicates: true });

  if (error) {
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }

  if (email) {
    const registerUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login`;
    const { subject, html } = wooPurchaseReceivedEmail({ hours: totalHours, registerUrl });
    sendEmail({ to: email, subject, html }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
