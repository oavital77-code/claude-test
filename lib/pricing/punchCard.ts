// תצוגה בלבד — לצורך הצגת פירוט מחיר לפני רכישה. המקור הסמכותי לחישוב
// בפועל הוא ה-RPC create_punch_card_purchase (ר' migrations), כדי שלא
// יהיה מרווח לתמרון בצד לקוח.
export interface PunchCardTierLike {
  hours: number;
  price_per_hour: number;
  deposit_hours: number;
}

export interface PunchCardPricing {
  price: number;
  deposit: number;
  beforeVat: number;
  vat: number;
  total: number;
}

export function computePunchCardPricing(
  tier: PunchCardTierLike,
  vatRate: number,
): PunchCardPricing {
  const price = tier.hours * tier.price_per_hour;
  const deposit = tier.deposit_hours * tier.price_per_hour;
  const beforeVat = price + deposit;
  const vat = Math.round(beforeVat * vatRate * 100) / 100;
  const total = beforeVat + vat;
  return { price, deposit, beforeVat, vat, total };
}
