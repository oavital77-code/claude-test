import type { CleanaPlusBookedTimes } from "./sync";

// נוסח האזהרה לפני ביטול/שינוי של הזמנה שיש לה תורים ב-Cleana+ (שלב 3).
// מודול טהור — משותף לממשק המטפלים ולפאנל הניהול.

export function cleanaPlusWarningText(check: CleanaPlusBookedTimes, audience: "therapist" | "admin"): string | null {
  if (check.status === "none") return null;
  if (check.status === "unknown") {
    return audience === "therapist"
      ? "לא הצלחנו לבדוק ב-Cleana+ אם לקוחות קבעו בשעות האלה. אם כן, התורים שלהם לא יבוטלו אוטומטית."
      : "לא הצלחנו לבדוק אם למטפל/ת יש תורים שנקבעו ב-Cleana+ בשעות האלה.";
  }
  const times = check.times.join(", ");
  const one = check.times.length === 1;
  return audience === "therapist"
    ? `שימו לב: ב-Cleana+ ${one ? "קבוע/ה לקוח/ה" : "קבועים לקוחות"} בשעה ${times}. ${one ? "התור לא יבוטל" : "התורים לא יבוטלו"} אוטומטית — ${one ? "הוא יסומן" : "הם יסומנו"} "אין חדר" ותקבל/י מייל כדי לטפל ${one ? "בלקוח/ה" : "בלקוחות"}.`
    : `למטפל/ת יש ${one ? "תור שנקבע" : "תורים שנקבעו"} ב-Cleana+ בשעה ${times} (פרטי הלקוחות לא מוצגים). ${one ? "התור יסומן" : "התורים יסומנו"} "אין חדר" והמטפל/ת יקבל/תקבל מייל.`;
}
