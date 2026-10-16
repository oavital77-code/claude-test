import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchRecentWooOrders, isWooRestConfigured } from "./rest-client";
import { processWooOrder } from "./process-order";

/**
 * שולף הזמנות שנוצרו/עודכנו ב-Woo ב-`sinceMinutesAgo` הדקות האחרונות
 * ומזין כל אחת ל-processWooOrder (אותה לוגיקה שה-webhook היה מפעיל).
 * אידמפוטנטי — קריאה חוזרת על אותה הזמנה לא מזכה כפול (ר' process-order.ts).
 * best-effort: אם אין מפתחות מוגדרים, או שהקריאה ל-Woo נכשלת, פשוט לא עושה כלום.
 */
export async function pollWooOrders(
  sinceMinutesAgo: number,
  options: { throttleSeconds?: number } = {},
): Promise<{ checked: number; processed: number }> {
  if (!isWooRestConfigured()) return { checked: 0, processed: 0 };

  const supabase = createAdminClient();

  // הגבלת קצב גלובלית (משותפת לכל מופעי השרת): בלי זה כל טעינת עמוד של כל
  // מטפל/ת הייתה קריאה לחנות — מאות בשעה, והחנות עלולה לחסום. ר' 20261016000001.
  if (options.throttleSeconds) {
    const { data: claimed, error } = await supabase.rpc("try_claim_woo_poll", {
      p_min_interval_seconds: options.throttleSeconds,
    });
    if (error || !claimed) return { checked: 0, processed: 0 };
  }

  const orders = await fetchRecentWooOrders(sinceMinutesAgo);
  if (orders.length === 0) return { checked: 0, processed: 0 };

  let processed = 0;
  for (const order of orders) {
    const result = await processWooOrder(supabase, order);
    if (result.ok && !result.skipped) processed++;
  }

  return { checked: orders.length, processed };
}
