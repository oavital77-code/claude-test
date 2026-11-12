import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// הצפנת המפתח האישי ש-Cleana+ מנפיקה לכל מטפל/ת לפני שמירה ב-DB.
// AES-256-GCM (מאומת: טקסט מוצפן שעבר שינוי נכשל בפענוח ולא מחזיר זבל).
// המפתח: CLEANA_PLUS_TOKEN_KEY — 32 בתים ב-base64, server-only.
// דליפת גיבוי של ה-DB לבדה לא חושפת מפתחות שעובדים מול Cleana+.

const KEY_ENV = "CLEANA_PLUS_TOKEN_KEY";
const VERSION = "v1";

function key(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) throw new Error(`${KEY_ENV} is not configured`);
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 32) throw new Error(`${KEY_ENV} must be 32 bytes, base64-encoded`);
  return decoded;
}

export function hasTokenKey(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** `v1.<iv>.<tag>.<ciphertext>`, base64url. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptToken(payload: string): string {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error("bad ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

/** השוואה בזמן קבוע של שתי מחרוזות (state מול העוגייה). */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right) && a.length === b.length;
}
