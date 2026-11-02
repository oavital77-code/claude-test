import { NextResponse } from "next/server";
import { verifyWooWebhook } from "@/lib/woo/verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { processWooOrder, type WooOrderPayload } from "@/lib/woo/process-order";

// Webhook של WooCommerce (push) — המסלול המיידי: החנות שולחת את ההזמנה לכאן
// ברגע שהיא משתנה (topic "Order updated"), והיא נזקפת באותו רגע. ה-polling
// (בטעינת עמוד + cron יומי) נשאר כרשת ביטחון; העיבוד אידמפוטנטי, אז אותה
// הזמנה שמגיעה משני המסלולים לא נזקפת פעמיים.
//
// הגדרה בחנות: WooCommerce → Settings → Advanced → Webhooks → Add webhook:
// Status Active · Topic "Order updated" · Delivery URL <APP_URL>/api/woo/webhook
// · Secret = הערך של WOOCOMMERCE_WEBHOOK_SECRET ב-Vercel · API v3.
//
// קודי תשובה: Woo מכבה webhook אחרי 5 כשלים רצופים, לכן 200 לכל מה שלא
// יצליח גם בניסיון חוזר (הזמנה בלי מייל, נושא אחר) — שגיאה רק על חתימה לא
// תקינה או כשל שמירה אמיתי.
export async function POST(request: Request) {
  const rawBody = await request.text();

  // פינג הבדיקה ש-Woo שולח כשיוצרים/מפעילים webhook: גוף "webhook_id=N",
  // בלי חתימה. לא מעובד — רק מאשרים שהכתובת חיה (אחרת Woo מציג שגיאה).
  if (/^webhook_id=\d+$/.test(rawBody.trim())) {
    return NextResponse.json({ ok: true, ping: true });
  }

  const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "WEBHOOK_NOT_CONFIGURED" }, { status: 500 });
  }
  if (!verifyWooWebhook(rawBody, request.headers, secret)) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  const topic = request.headers.get("x-wc-webhook-topic");
  if (topic && !topic.startsWith("order.")) {
    return NextResponse.json({ ok: true, skipped: "NOT_AN_ORDER_TOPIC" });
  }

  let order: WooOrderPayload;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, skipped: "INVALID_PAYLOAD" });
  }

  const supabase = createAdminClient();
  const result = await processWooOrder(supabase, order);

  if (!result.ok && result.skipped === "SAVE_FAILED") {
    console.error("[woo-webhook] שמירת רכישה נכשלה, הזמנה", order.id);
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, skipped: result.skipped });
}
