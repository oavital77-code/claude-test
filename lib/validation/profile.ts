import { z } from "zod";

// עריכה עצמית של הכרטיס האישי. השדות כאן הם *רק* אלה שמותר למטפל/ת לשנות
// בעצמו/ה — ר' ההערה ב-app/(app)/profile/actions.ts. טלפון, מייל ות״ז אינם
// כאן בכוונה: הם שדות זהות, וה-trigger enforce_profile_privilege_columns
// מחזיר אותם לערכם הקודם גם אם מישהו ינסה לעקוף את הטופס.
export const profileEditSchema = z.object({
  full_name: z.string().trim().min(2, "יש להזין שם מלא").max(80, "השם ארוך מדי"),
  profession: z.string().trim().min(2, "יש להזין תחום טיפול").max(80, "התיאור ארוך מדי"),
  business_number: z
    .string()
    .trim()
    .regex(/^\d{9}$/, "מספר עוסק/ח.פ צריך להכיל 9 ספרות")
    .optional()
    .or(z.literal("")),
});

export type ProfileEditValues = z.infer<typeof profileEditSchema>;
