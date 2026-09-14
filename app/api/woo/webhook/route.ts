import { NextResponse } from "next/server";
import { verifyWooWebhook } from "@/lib/woo/verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { processWooOrder, type WooOrderPayload } from "@/lib/woo/process-order";

// חנות ה-WooCommerce (baclinica-shop) היא מקור האמת היחיד לתשלום — לא PayPlus
// (ר' CLAUDE.md, שוחרר לגמרי מ-PayPlus). זהו נתיב ה-webhook (push) — אם
// מוגדר webhook בפועל בחנות, הוא מזין הזמנות לכאן ברגע שהן משולמות. אם אין
// webhook מוגדר (המצב הנוכחי), המסלול הפעיל הוא ה-polling דרך ה-REST API —
// ר' app/api/cron/poll-woo-orders ו-lib/woo/rest-client.ts — ששולף הזמנות
// ומזין אותן לאותה processWooOrder בדיוק. הראוט הזה נשאר עובד ומוכן למקרה
// שיוגדר webhook בעתיד.
//
// ⚠️ צורת ה-payload כאן (order.id/status/billing/line_items) מבוססת על
// ה-WooCommerce REST API / Webhooks הסטנדרטי. יש לאמת מול הגדרות ה-webhook
// בפועל בחנות (Settings → Advanced → Webhooks) לפני production, כולל הנושא
// (topic) המדויק שנבחר (מומלץ "Order updated" כדי לתפוס מעבר ל-processing).
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

  const supabase = createAdminClient();
  const result = await processWooOrder(supabase, order);

  if (!result.ok) {
    return NextResponse.json({ error: result.skipped ?? "PROCESSING_FAILED" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, skipped: result.skipped });
}
