/**
 * מגבלות העלאת תמונות חדרים — משותפות לשרת וללקוח.
 *
 * קובץ נפרד מ-`app/(admin)/admin/rooms/actions.ts` בכוונה: קובץ "use server"
 * יכול לייצא רק פונקציות async, אז אי אפשר לייבא ממנו קבועים לקומפוננטת
 * לקוח. כאן שני הצדדים בודקים בדיוק את אותם ערכים.
 *
 * שים לב: `bodySizeLimit` ב-next.config.ts חייב להישאר גדול מ-MAX_IMAGE_BYTES
 * (כולל מרווח ל-overhead של multipart), אחרת Next.js חוסם את הבקשה עוד לפני
 * שה-action רץ והוולידציה כאן לא נותנת שום הודעה מועילה.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** מחזיר הודעת שגיאה בעברית, או null אם הקובץ תקין. */
export function validateRoomImage(file: { type: string; size: number }): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "מותר רק קבצי JPG, PNG או WEBP";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "הקובץ גדול מדי (מקסימום 5MB)";
  }
  return null;
}
