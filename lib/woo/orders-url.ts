export const ORDERS_PER_PAGE = 100;

/**
 * כתובת שליפת הזמנות מ-WooCommerce REST API. מסנן לפי `modified_after` (תאריך
 * עדכון, Woo ≥5.8) ולא `after` (תאריך יצירה): הזמנה שעוברת ל-processing/
 * completed זמן רב אחרי שנוצרה — תשלום שהושלם מאוחר, on-hold שסומן ידנית
 * כשולם — מתעדכנת אז, ולכן נתפסת בחלון. dates_are_gmt: ה-ISO שלנו ב-UTC.
 */
export function buildOrdersUrl(baseUrl: string, modifiedAfterIso: string, page: number): string {
  const url = new URL("/wp-json/wc/v3/orders", baseUrl);
  url.searchParams.set("modified_after", modifiedAfterIso);
  url.searchParams.set("dates_are_gmt", "true");
  url.searchParams.set("per_page", String(ORDERS_PER_PAGE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");
  return url.toString();
}
