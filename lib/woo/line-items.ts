// לוגיקה טהורה לפירוק שורות הזמנת Woo — בלי "server-only" בכוונה, כדי שתהיה
// ניתנת לבדיקה ב-vitest (אותו שיקול כמו lib/cron/auth.ts מול lib/cron/guard.ts).
// המודול הזה נוגע בכסף, ולכן הוא הראשון ב-lib/woo/ שמכוסה בטסטים.

export interface WooLineItemLike {
  product_id: number;
  variation_id?: number;
  quantity: number;
  total: string;
  total_tax?: string;
}

export interface TierMapping {
  woo_product_id: number;
  tier_id: string;
}

export interface PurchaseRow {
  tier_id: string;
  quantity: number;
  amount_total: number;
}

// כרטיסייה ב-Woo היא מוצר משתנה (variable product) אחד — ל-line_item יש
// product_id משותף לכל המדרגות (ה"הורה") ו-variation_id נפרד לכל מדרגה
// בפועל. woo_product_tiers ממופה ל-variation_id (378–382), לא ל-product_id
// (377) — variation_id=0/חסר (מוצר פשוט, כמו הססיה) → falls back ל-product_id.
export function effectiveProductId(item: Pick<WooLineItemLike, "product_id" | "variation_id">): number {
  return item.variation_id && item.variation_id !== 0 ? item.variation_id : item.product_id;
}

/**
 * הסכום שנזקף הוא זה ש-Woo מדווח ששולם בפועל בשורה הזו (כולל מע"מ), לא
 * חישוב מחדש ממחיר המדרגה — ר' חוק ברזל #6 (מקור האמת לתשלום).
 * מחזיר null אם Woo החזיר משהו שאינו מספר, כדי שהשורה תידחה במפורש
 * במקום להיזקף כ-NaN.
 */
export function lineItemAmount(item: Pick<WooLineItemLike, "total" | "total_tax">): number | null {
  const amount = parseFloat(item.total) + parseFloat(item.total_tax ?? "0");
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

/**
 * ממיר שורות הזמנה לשורות woo_pending_purchases — **שורה אחת לכל מדרגה**.
 *
 * 🔴 האיחוד לפי tier_id הוא התיקון לבאג אמיתי, לא ניקיון: ל-
 * woo_pending_purchases יש UNIQUE (woo_order_id, tier_id), וה-upsert נשלח
 * עם ignoreDuplicates (= ON CONFLICT DO NOTHING). שתי שורות עם אותו מפתח
 * באותו INSERT גורמות לשנייה להתנגש עם הראשונה שזה עתה נכתבה ולהיזרק —
 * בשקט, בלי שגיאה. לקוח שהזמין פעמיים את אותה מדרגה שילם כפול וזוכה חצי.
 * WooCommerce אמנם ממזג בדרך כלל פריטים זהים ל-quantity אחד, אבל הזמנה
 * שנוצרת ידנית בחנות, או פריטים עם meta שונה, כן מייצרים שורות נפרדות.
 */
export function aggregatePurchaseRows(
  lineItems: WooLineItemLike[],
  mappings: TierMapping[],
): PurchaseRow[] {
  const byTier = new Map<string, PurchaseRow>();

  for (const item of lineItems) {
    const productId = effectiveProductId(item);
    const mapping = mappings.find((m) => m.woo_product_id === productId);
    if (!mapping) continue;

    const amount = lineItemAmount(item);
    if (amount === null) continue;

    const existing = byTier.get(mapping.tier_id);
    if (existing) {
      existing.quantity += item.quantity;
      // עיגול חוזר אחרי החיבור — סכום כל שורה כבר מעוגל, אבל חיבור של
      // שברים בינאריים יכול להחזיר 1297.9999999999998.
      existing.amount_total = Math.round((existing.amount_total + amount) * 100) / 100;
    } else {
      byTier.set(mapping.tier_id, {
        tier_id: mapping.tier_id,
        quantity: item.quantity,
        amount_total: amount,
      });
    }
  }

  return [...byTier.values()];
}
