/**
 * signUp על מייל שכבר רשום ומאומת מחזיר "הצלחה" עם user בלי identities —
 * ו-Supabase לא שולח שום מייל. בלי הזיהוי הזה המסך אמר "שלחנו לך קישור",
 * והמטפל/ת חיכה/תה למייל שלא יגיע (טל ברוך, אלון קדם — 17/10, שקיבלו
 * סיסמה זמנית וניסו "הרשמה" כדי לקבוע סיסמה חדשה).
 */
export function isExistingAccountSignup(user: { identities?: unknown[] | null } | null): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

export const EXISTING_ACCOUNT_MESSAGE =
  "כבר יש חשבון עם המייל הזה, ולכן לא נשלח מייל. יש להיכנס בכפתור \"התחברות\" עם הסיסמה שלך — " +
  "אם קיבלת סיסמה זמנית מההנהלה, היכנס/י איתה ותתבקש/י לבחור סיסמה חדשה. לא זוכר/ת? \"שכחתי סיסמה\".";
