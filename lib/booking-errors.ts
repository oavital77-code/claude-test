// מיפוי קודי השגיאה מה-RPCs (נספח ב' באפיון) להודעות בעברית למשתמש.
const MESSAGES: Record<string, string> = {
  NO_CREDIT: "אין לך יתרת שעות בתוקף. יש לרכוש כרטיסייה.",
  INSUFFICIENT_HOURS: "היתרה הזמינה קטנה מהמבוקש.",
  DEPOSIT_DEPLETED: "הפיקדון שלך חסר — יש להשלים אותו לפני הזמנה חדשה.",
  CARD_EXPIRED: "הכרטיסייה פגה.",
  ROOM_TAKEN: "המשבצת נתפסה זה עתה על ידי מטפל אחר.",
  ROOM_UNAVAILABLE: "החדר אינו זמין כרגע.",
  SELF_OVERLAP: "יש לך כבר הזמנה בטווח הזמן הזה.",
  TOO_FAR_AHEAD: "לא ניתן להזמין כל כך הרבה קדימה.",
  INVALID_SLOT: "המשבצת אינה תקינה.",
  BOOKING_PASSED: "המועד כבר עבר.",
  SESSION_NOT_CANCELLABLE: "מפגש ססיה לא ניתן לביטול עצמאי. לביטול פנו להנהלה.",
  USER_SUSPENDED: "החשבון מושעה זמנית.",
  PAYMENT_REQUIRED: "נדרש תשלום.",
  FORBIDDEN: "אין הרשאה לפעולה זו.",
};

export function bookingErrorMessage(code: string | undefined): string {
  if (!code) return "משהו השתבש. נסו שוב.";
  return MESSAGES[code] ?? "משהו השתבש. נסו שוב.";
}
