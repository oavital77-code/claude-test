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
export async function pollWooOrders(sinceMinutesAgo: number): Promise<{ checked: number; processed: number }> {
  if (!isWooRestConfigured()) return { checked: 0, processed: 0 };

  const orders = await fetchRecentWooOrders(sinceMinutesAgo);
  if (orders.length === 0) return { checked: 0, processed: 0 };

  const supabase = createAdminClient();
  let processed = 0;
  for (const order of orders) {
    const result = await processWooOrder(supabase, order);
    if (result.ok && !result.skipped) processed++;
  }

  return { checked: orders.length, processed };
}
