// מיפוי שגיאות Supabase Auth להודעות בעברית — במקום אחד, לפי error.code.
//
// רקע (11/10): טופס איפוס הסיסמה הציג על *כל* שגיאה "ייתכן שהקישור פג
// תוקף". בפועל הקישור היה תקין, והשרת דחה את הסיסמה כי היא מופיעה במאגר
// סיסמאות שדלפו (ההגנה שהופעלה ב-07/10). ההודעה השגויה שלחה את המשתמש
// לבקש קישור חדש שוב ושוב. בהרשמה, באותו מצב, הוצג הטקסט האנגלי הגולמי.
//
// פונקציה טהורה בלי תלויות — כדי שתהיה ניתנת לבדיקה ב-vitest.

type AuthErrorLike = { code?: string | null; message?: string | null };
export type AuthFlow = "signup" | "reset";

function codeOf(error: AuthErrorLike): string {
  if (error.code) return error.code;
  // גיבוי לפי טקסט — שרתים ישנים לא תמיד מחזירים code.
  const m = error.message ?? "";
  if (/weak|easy to guess|pwned|leaked/i.test(m)) return "weak_password";
  if (/same.*password|should be different/i.test(m)) return "same_password";
  if (/already registered|already exists/i.test(m)) return "user_already_exists";
  if (/rate limit/i.test(m)) return "over_request_rate_limit";
  return "unknown";
}

export function authErrorMessage(error: AuthErrorLike, flow: AuthFlow): string {
  switch (codeOf(error)) {
    case "weak_password":
      return "הסיסמה הזו נפוצה מדי או שדלפה בעבר באינטרנט, ולכן אינה מאושרת. יש לבחור סיסמה אחרת — עדיף משפט קצר או שילוב של כמה מילים.";
    case "same_password":
      return "הסיסמה החדשה זהה לקודמת — יש לבחור סיסמה אחרת.";
    case "session_not_found":
    case "session_expired":
    case "reauthentication_needed":
      return "הקישור פג תוקף. יש לחזור למסך ההתחברות ולבקש קישור איפוס חדש.";
    case "user_already_exists":
    case "email_exists":
      return 'כתובת המייל כבר בשימוש. אם זה אתה — לחץ/י על "התחברות" במקום.';
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "בוצעו יותר מדי ניסיונות בזמן קצר. יש להמתין כמה דקות ולנסות שוב.";
    default:
      return flow === "reset" ? "עדכון הסיסמה נכשל. נסו שוב בעוד רגע." : "ההרשמה נכשלה. נסו שוב בעוד רגע.";
  }
}
