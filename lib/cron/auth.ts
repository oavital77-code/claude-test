import { timingSafeEqual } from "node:crypto";

/**
 * true רק אם הבקשה נושאת את ה-header שVercel Cron שולח אוטומטית
 * (Authorization: Bearer $CRON_SECRET) כש-CRON_SECRET מוגדר בפרויקט. בלי
 * CRON_SECRET מוגדר בסביבה — נכשל סגור (false), לא פתוח: נתיבי ה-cron
 * לא יהיו נגישים בכלל עד שהסוד יוגדר, במקום להיות פתוחים לכל האינטרנט.
 *
 * קובץ נפרד מ-guard.ts (בלי "server-only" ובלי תלות ב-Supabase/Resend)
 * כדי שיהיה ניתן לבדיקת יחידה טהורה בלי mocking.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = Buffer.from(request.headers.get("authorization") ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  // השוואה בזמן קבוע (לא ===) — שלא יהיה אפשר לנחש את הסוד תו-אחר-תו לפי זמן תגובה.
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
