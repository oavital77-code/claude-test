"use server";

import { createClient } from "@/lib/supabase/server";
import { parseOtpType, safeNext } from "@/lib/auth/email-link";

export type ConfirmResult = { ok: true; next: string } | { ok: false };

/**
 * ניצול הקוד החד-פעמי מהמייל — רק בלחיצה על הכפתור (POST), לא בפתיחת
 * הקישור. ר' lib/auth/email-link.ts למה.
 *
 * מחזיר תוצאה ולא redirect: הלקוח עושה טעינה מלאה ל-next (כך שה-cookie של
 * הסשן החדש בטוח נקלט), ומנטרל את הכפתור בזמן ההמתנה. בלי זה, לחיצות
 * חוזרות בזמן ההמתנה ניצלו קוד שכבר נוצל, והאחרונה (הכושלת) "ניצחה" —
 * המטפלת קיבלה "פג תוקף" למרות שהלחיצה הראשונה הצליחה (16/10).
 */
export async function confirmEmailLink(input: { tokenHash: string; type: string; next: string }): Promise<ConfirmResult> {
  const type = parseOtpType(input.type);
  const next = safeNext(input.next);
  if (!input.tokenHash || !type) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: input.tokenHash });
  if (!error) return { ok: true, next };

  // הקוד כבר נוצל — אבל אם יש כבר סשן תקף (לחיצה קודמת הצליחה), ממשיכים.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { ok: true, next } : { ok: false };
}
