import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// 🔴 חוק ברזל (CLAUDE.md #6): מקור האמת לתשלום הוא ה-callback, ולעולם לא לעדכן
// סטטוס תשלום בלי לאמת hash מול PAYPLUS_SECRET_KEY קודם.
//
// ⚠️ המימוש כאן מניח את התבנית הנפוצה ב-webhooks של ספקי תשלום: HMAC-SHA256
// על גוף הבקשה הגולמי (raw body, לפני JSON.parse), מושווה מול חתימה שמגיעה
// בכותרת הבקשה. השם המדויק של הכותרת ("payplus-hash" כאן) ואופן החישוב
// (אילו בייטים בדיוק נכנסים ל-HMAC) לא מתועדים במסמך האפיון שסופק — יש
// לאמת את שניהם מול תיעוד ה-API הרשמי / Postman collection של PayPlus לפני
// שהמסלול הזה מקבל תשלומים אמיתיים. עד אז — נכשל תמיד ל"דחייה" (fail closed)
// ולא ל"קבלה", אם משהו לא ודאי.
const PAYPLUS_HASH_HEADER = "payplus-hash";

export function verifyPayPlusCallback(rawBody: string, headers: Headers, secretKey: string): boolean {
  const providedHash = headers.get(PAYPLUS_HASH_HEADER);
  if (!providedHash) return false;

  const expectedHash = createHmac("sha256", secretKey).update(rawBody, "utf8").digest("hex");

  const provided = Buffer.from(providedHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
}
