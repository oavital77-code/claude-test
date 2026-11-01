// קישורים יוצאים שנספרים. ה-href בממשק הוא /api/go/<slug> — ה-route רושם
// לחיצה ומפנה ל-url. רשימה סגורה (לא פרמטר url חופשי) — אין open redirect.
export const CLEANA_PLUS_URL = "https://cleanaplus.cleanagroup.app/";
const PAYPLUS_AFFILIATE_URL = "https://aff.pays.plus/cf3975e1-6a1a-4043-8745-665c8c35be81?ref=";

export const OUTBOUND_LINKS = {
  "cleana-plus": { key: "cleana_plus", url: CLEANA_PLUS_URL, label: "Cleana+ (סרגל ניווט)" },
  "promo-bottom": { key: "promo_bottom", url: PAYPLUS_AFFILIATE_URL, label: "באנר PayPlus — תחתית העמוד" },
  "promo-sidebar": { key: "promo_sidebar", url: PAYPLUS_AFFILIATE_URL, label: "באנר PayPlus — סרגל הצד" },
} as const;

export type OutboundSlug = keyof typeof OUTBOUND_LINKS;
export type OutboundKey = (typeof OUTBOUND_LINKS)[OutboundSlug]["key"];

export const outboundHref = (slug: OutboundSlug) => `/api/go/${slug}`;

export function isOutboundSlug(s: string): s is OutboundSlug {
  return Object.prototype.hasOwnProperty.call(OUTBOUND_LINKS, s);
}
