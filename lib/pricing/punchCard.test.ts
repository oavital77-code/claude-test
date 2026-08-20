import { describe, expect, it } from "vitest";
import { computePunchCardPricing, type PunchCardTierLike } from "./punchCard";

const VAT_RATE = 0.18;

// 5 המדרגות המדויקות מ-CLAUDE.md / מסמך האפיון (לפני מע"מ).
// deposit_hours = 2 בכל המדרגות: "פיקדון = 2 × price_per_hour".
const TIERS: [PunchCardTierLike, { price: number; deposit: number; total: number }][] = [
  [{ hours: 10, price_per_hour: 55, deposit_hours: 2 }, { price: 550, deposit: 110, total: 778.8 }],
  [{ hours: 20, price_per_hour: 50, deposit_hours: 2 }, { price: 1000, deposit: 100, total: 1298 }],
  [{ hours: 30, price_per_hour: 45, deposit_hours: 2 }, { price: 1350, deposit: 90, total: 1699.2 }],
  [{ hours: 40, price_per_hour: 40, deposit_hours: 2 }, { price: 1600, deposit: 80, total: 1982.4 }],
  [{ hours: 50, price_per_hour: 35, deposit_hours: 2 }, { price: 1750, deposit: 70, total: 2147.6 }],
];

describe("computePunchCardPricing", () => {
  it.each(TIERS)("מדרגה %o", (tier, expected) => {
    const result = computePunchCardPricing(tier, VAT_RATE);
    expect(result.price).toBe(expected.price);
    expect(result.deposit).toBe(expected.deposit);
    expect(result.total).toBeCloseTo(expected.total, 5);
  });

  it("total תמיד שווה ל-beforeVat + vat", () => {
    for (const [tier] of TIERS) {
      const result = computePunchCardPricing(tier, VAT_RATE);
      expect(result.total).toBeCloseTo(result.beforeVat + result.vat, 5);
    }
  });

  it("מע\"מ מעוגל לשתי ספרות אחרי הנקודה", () => {
    const result = computePunchCardPricing({ hours: 10, price_per_hour: 33, deposit_hours: 2 }, VAT_RATE);
    // beforeVat = 330+66=396, vat = 396*0.18=71.28
    expect(result.vat).toBe(71.28);
  });

  it("שיעור מע\"מ 0 מחזיר total שווה ל-beforeVat", () => {
    const result = computePunchCardPricing({ hours: 10, price_per_hour: 55, deposit_hours: 2 }, 0);
    expect(result.vat).toBe(0);
    expect(result.total).toBe(result.beforeVat);
  });
});
