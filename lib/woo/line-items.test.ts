import { describe, expect, it } from "vitest";
import { aggregatePurchaseRows, effectiveProductId, lineItemAmount } from "./line-items";

const TIER_10H = "11111111-1111-4111-8111-111111111111";
const TIER_20H = "22222222-2222-4222-8222-222222222222";

// המיפוי כפי שהוא ב-woo_product_tiers: variation_id של המדרגה → tier_id.
const MAPPINGS = [
  { woo_product_id: 378, tier_id: TIER_10H },
  { woo_product_id: 379, tier_id: TIER_20H },
];

describe("effectiveProductId", () => {
  it("מוצר משתנה (כרטיסייה) — variation_id גובר על product_id", () => {
    expect(effectiveProductId({ product_id: 377, variation_id: 378 })).toBe(378);
  });

  it("מוצר פשוט (ססיה) — variation_id חסר או 0 → product_id", () => {
    expect(effectiveProductId({ product_id: 333 })).toBe(333);
    expect(effectiveProductId({ product_id: 333, variation_id: 0 })).toBe(333);
  });
});

describe("lineItemAmount", () => {
  it("מחבר total + total_tax", () => {
    expect(lineItemAmount({ total: "550", total_tax: "99" })).toBe(649);
  });

  it("total_tax חסר נחשב 0", () => {
    expect(lineItemAmount({ total: "550" })).toBe(550);
  });

  it("מעגל לשתי ספרות אחרי הנקודה", () => {
    expect(lineItemAmount({ total: "10.005", total_tax: "0" })).toBe(10.01);
  });

  it("סכום לא-מספרי → null (השורה תידחה, לא תיזקף כ-NaN)", () => {
    expect(lineItemAmount({ total: "" })).toBeNull();
    expect(lineItemAmount({ total: "abc" })).toBeNull();
  });
});

describe("aggregatePurchaseRows", () => {
  it("שורה בודדת ממופה", () => {
    const rows = aggregatePurchaseRows(
      [{ product_id: 377, variation_id: 378, quantity: 1, total: "550", total_tax: "99" }],
      MAPPINGS,
    );
    expect(rows).toEqual([{ tier_id: TIER_10H, quantity: 1, amount_total: 649 }]);
  });

  // 🔴 הבאג: (woo_order_id, tier_id) הוא UNIQUE, ו-upsert עם ignoreDuplicates
  // זורק בשקט את השנייה מבין שתי שורות עם אותו מפתח באותו INSERT.
  // הלקוח שילם 1298 וזוכה ב-649.
  it("שתי שורות מאותה מדרגה מתאחדות לשורה אחת עם הסכום והכמות המלאים", () => {
    const rows = aggregatePurchaseRows(
      [
        { product_id: 377, variation_id: 378, quantity: 1, total: "550", total_tax: "99" },
        { product_id: 377, variation_id: 378, quantity: 1, total: "550", total_tax: "99" },
      ],
      MAPPINGS,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ tier_id: TIER_10H, quantity: 2, amount_total: 1298 });
  });

  it("מדרגות שונות נשארות שורות נפרדות", () => {
    const rows = aggregatePurchaseRows(
      [
        { product_id: 377, variation_id: 378, quantity: 1, total: "550", total_tax: "99" },
        { product_id: 377, variation_id: 379, quantity: 2, total: "2000", total_tax: "360" },
      ],
      MAPPINGS,
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.tier_id === TIER_10H)).toEqual({ tier_id: TIER_10H, quantity: 1, amount_total: 649 });
    expect(rows.find((r) => r.tier_id === TIER_20H)).toEqual({ tier_id: TIER_20H, quantity: 2, amount_total: 2360 });
  });

  it("פריט שאינו ממופה (ססיה, מוצר אחר) מסונן החוצה", () => {
    expect(aggregatePurchaseRows([{ product_id: 333, quantity: 1, total: "600" }], MAPPINGS)).toEqual([]);
  });

  it("שורה עם סכום לא תקין נדחית בלי להרעיל את שאר השורות", () => {
    const rows = aggregatePurchaseRows(
      [
        { product_id: 377, variation_id: 378, quantity: 1, total: "abc" },
        { product_id: 377, variation_id: 379, quantity: 1, total: "1000", total_tax: "180" },
      ],
      MAPPINGS,
    );
    expect(rows).toEqual([{ tier_id: TIER_20H, quantity: 1, amount_total: 1180 }]);
  });
});
