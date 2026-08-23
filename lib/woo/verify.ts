import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// אימות חתימת webhook של WooCommerce: HMAC-SHA256 על גוף הבקשה הגולמי,
// מקודד ב-base64, בכותרת X-WC-Webhook-Signature (תיעוד WooCommerce Webhooks API).
const WOO_SIGNATURE_HEADER = "x-wc-webhook-signature";

export function verifyWooWebhook(rawBody: string, headers: Headers, secret: string): boolean {
  const providedSignature = headers.get(WOO_SIGNATURE_HEADER);
  if (!providedSignature) return false;

  const expectedSignature = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  let provided: Buffer;
  let expected: Buffer;
  try {
    provided = Buffer.from(providedSignature, "base64");
    expected = Buffer.from(expectedSignature, "base64");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
}
