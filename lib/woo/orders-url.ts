export const ORDERS_PER_PAGE = 100;

/**
 * לפי מה מסננים את חלון הזמן:
 * - "created" — `after` (תאריך יצירה). השאילתה המקורית שעבדה חודשים; משמשת
 *   את הבדיקה המהירה בכל טעינת עמוד. בכוונה בלי dates_are_gmt — זהה למה
 *   שעבד בפועל (בלעדיו Woo משווה לשעון המקומי, כלומר החלון רק *מתרחב*).
 * - "modified" — `modified_after` + dates_are_gmt (תאריך עדכון, Woo ≥5.8):
 *   תופס הזמנה ששולמה/סומנה כשולמה זמן רב אחרי שנוצרה. רק ב-cron היומי —
 *   אחרי המעבר אליה גם בבדיקה המהירה (31/10) הבדיקה המהירה הפסיקה לתפוס
 *   הזמנות (1078, 1079), כנראה כי השאילתה הזו איטית בחנות.
 */
export type OrdersDateField = "created" | "modified";

export function buildOrdersUrl(
  baseUrl: string,
  sinceIso: string,
  page: number,
  field: OrdersDateField = "created",
): string {
  const url = new URL("/wp-json/wc/v3/orders", baseUrl);
  if (field === "modified") {
    url.searchParams.set("modified_after", sinceIso);
    url.searchParams.set("dates_are_gmt", "true");
  } else {
    url.searchParams.set("after", sinceIso);
  }
  url.searchParams.set("per_page", String(ORDERS_PER_PAGE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");
  return url.toString();
}
