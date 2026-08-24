import "server-only";
import type { WooOrderPayload } from "./process-order";

// גישה ל-WooCommerce REST API — משמשת ל-polling כשאין webhook מוגדר בחנות
// (המצב הנוכחי). דורש מפתחות Consumer Key/Secret עם הרשאת Read בלבד
// (WooCommerce → Settings → Advanced → REST API) — לא נדרשת הרשאת כתיבה,
// כי הקוד הזה רק קורא הזמנות, אף פעם לא יוצר/משנה אותן בחנות.
//
// ⚠️ המפתחות האלה נותנים גישת קריאה לכל ההזמנות בחנות (לא רק המוצרים
// שלנו) — הם server-only, אף פעם לא נחשפים ל-client. ר' חוק ברזל #2.

function wooCredentials() {
  const baseUrl = process.env.NEXT_PUBLIC_WOOCOMMERCE_STORE_URL;
  const key = process.env.WOOCOMMERCE_KEY;
  const secret = process.env.WOOCOMMERCE_SECRET;
  if (!baseUrl || !key || !secret) return null;
  return { baseUrl, key, secret };
}

export function isWooRestConfigured(): boolean {
  return wooCredentials() !== null;
}

/**
 * שולף הזמנות ש-Woo יצר/עדכן מאז `sinceMinutesAgo` דקות אחורה — לא מסונן
 * לפי סטטוס (processWooOrder כבר מסנן ל-processing/completed בעצמו), כדי
 * לא להסתמך על תמיכה ב-multi-status query param בכל גרסת Woo.
 */
export async function fetchRecentWooOrders(sinceMinutesAgo: number): Promise<WooOrderPayload[]> {
  const creds = wooCredentials();
  if (!creds) return [];

  const after = new Date(Date.now() - sinceMinutesAgo * 60_000).toISOString();
  const url = new URL("/wp-json/wc/v3/orders", creds.baseUrl);
  url.searchParams.set("after", after);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");

  const auth = Buffer.from(`${creds.key}:${creds.secret}`).toString("base64");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`WooCommerce REST API החזיר ${res.status}`);
  }

  const orders = (await res.json()) as unknown;
  return Array.isArray(orders) ? (orders as WooOrderPayload[]) : [];
}
