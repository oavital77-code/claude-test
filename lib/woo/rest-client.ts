import "server-only";
import type { WooOrderPayload } from "./process-order";

// גישה ל-WooCommerce REST API — משמשת ל-polling כשאין webhook מוגדר בחנות
// (המצב הנוכחי). דורש מפתחות Consumer Key/Secret עם הרשאת Read בלבד
// (WooCommerce → Settings → Advanced → REST API) — לא נדרשת הרשאת כתיבה,
// כי הקוד הזה רק קורא הזמנות, אף פעם לא יוצר/משנה אותן בחנות.
//
// ⚠️ המפתחות האלה נותנים גישת קריאה לכל ההזמנות בחנות (לא רק המוצרים
// שלנו) — הם server-only, אף פעם לא נחשפים ל-client. ר' חוק ברזל #2.

const PER_PAGE = 100;
// תקרת ביטחון: 20 עמודים = 2,000 הזמנות בחלון אחד. מעבר לזה כנראה משהו
// לא בסדר בפרמטרים, ועדיף לעצור מאשר לדפדף בלי סוף מול החנות.
const MAX_PAGES = 20;

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
  const auth = Buffer.from(`${creds.key}:${creds.secret}`).toString("base64");
  const all: WooOrderPayload[] = [];

  // עמוד אחד של 100 לא מספיק: ה-cron היומי רץ על חלון של 26 שעות, ובלי
  // דפדוף כל הזמנה מעבר ל-100 הראשונות פשוט לא נראית. עם order=desc
  // הנושרות הן דווקא ההזמנות הישנות ביותר בחלון — כלומר אלה שקרובות
  // לצאת ממנו ולא להיתפס לעולם. עוצרים כשמתקבל עמוד חלקי.
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL("/wp-json/wc/v3/orders", creds.baseUrl);
    url.searchParams.set("after", after);
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));
    url.searchParams.set("orderby", "date");
    url.searchParams.set("order", "desc");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    });

    if (!res.ok) {
      // עמוד ראשון שנכשל = תקלה אמיתית, ראוי לזרוק (withCronAlert ידווח).
      // עמוד המשך שנכשל אחרי שכבר אספנו הזמנות — עדיף להחזיר את מה שיש
      // מאשר לאבד גם אותן; הריצה הבאה תשלים, כי העיבוד אידמפוטנטי.
      if (page === 1) {
        throw new Error(`WooCommerce REST API החזיר ${res.status}`);
      }
      console.error(`[woo] דפדוף נעצר בעמוד ${page}: HTTP ${res.status}`);
      break;
    }

    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) break;

    all.push(...(body as WooOrderPayload[]));
    if (body.length < PER_PAGE) break;
  }

  return all;
}
