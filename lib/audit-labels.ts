// תרגום קודי הפעולה ב-audit_log לעברית + סיווג לחומרה, עבור מסך "יומן פעולות"
// באדמין. הקודים עצמם נכתבים ב-RPC-ים (ר' supabase/migrations) ונשארים
// באנגלית בכוונה — ר' CLAUDE.md, "קודי שגיאה באנגלית".

/** מי יזם את הפעולה — קובע את הצבע והסינון במסך. */
export type AuditSeverity =
  | "therapist" // פעולה רגילה של מטפל/ת
  | "admin" // התערבות ידנית של אדמין
  | "money" // תנועה כספית
  | "alert"; // כישלון/השעיה — דורש תשומת לב

export const AUDIT_LABELS: Record<string, { label: string; severity: AuditSeverity }> = {
  // ── הזמנות ──
  booking_created: { label: "הזמנת חדר", severity: "therapist" },
  booking_cancelled: { label: "ביטול הזמנה", severity: "therapist" },
  booking_created_by_admin: { label: "שיבוץ ידני ע״י אדמין", severity: "admin" },
  booking_cancelled_by_admin: { label: "ביטול הזמנה ע״י אדמין", severity: "admin" },

  // ── כרטיסיות ושעות ──
  woo_purchase_claimed: { label: "רכישה מהחנות זוכתה", severity: "money" },
  bonus_hours_granted: { label: "הענקת שעות מתנה", severity: "admin" },
  admin_adjusted_punch_card_hours: { label: "התאמת שעות בכרטיסייה", severity: "admin" },
  deposit_completed_manually: { label: "השלמת פיקדון ידנית", severity: "admin" },

  // ── תשלומים ──
  payment_paid: { label: "תשלום התקבל", severity: "money" },
  payment_failed: { label: "תשלום נכשל", severity: "alert" },

  // ── ססיות ──
  session_requested: { label: "בקשת ססיה חדשה", severity: "therapist" },
  session_approved: { label: "בקשת ססיה אושרה", severity: "admin" },
  session_rejected: { label: "בקשת ססיה נדחתה", severity: "admin" },
  session_activated: { label: "ססיה הופעלה", severity: "money" },
  session_activated_manually: { label: "ססיה הופעלה ידנית", severity: "admin" },
  session_cancellation_requested: { label: "בקשת ביטול מנוי ססיה", severity: "therapist" },
  session_renewal_paid: { label: "חידוש ססיה שולם", severity: "money" },
  session_renewal_paid_manually: { label: "חידוש ססיה סומן ידנית", severity: "admin" },
  session_renewal_failed: { label: "חידוש ססיה נכשל", severity: "alert" },
  admin_added_session_slot: { label: "הוספת משבצת לססיה", severity: "admin" },
  session_materialization_conflict: { label: "התנגשות בשיבוץ ססיה", severity: "alert" },

  // ── חריגות והשעיות ──
  overrun_charge_succeeded: { label: "חיוב חריגה בוצע", severity: "money" },
  overrun_charge_failed_suspended: { label: "חיוב חריגה נכשל — הושעה", severity: "alert" },
  user_suspended_renewal_failures: { label: "השעיה עקב כישלונות חיוב", severity: "alert" },
};

export const SEVERITY_LABELS: Record<AuditSeverity, string> = {
  therapist: "מטפל/ת",
  admin: "אדמין",
  money: "כספי",
  alert: "דורש תשומת לב",
};

export const ENTITY_LABELS: Record<string, string> = {
  bookings: "הזמנה",
  punch_cards: "כרטיסייה",
  payments: "תשלום",
  profiles: "מטפל/ת",
  session_subscriptions: "ססיה",
};

/** קוד שאין לו תרגום מוצג כמו שהוא — עדיף מידע גולמי מאשר שורה ריקה. */
export function describeAuditAction(action: string): { label: string; severity: AuditSeverity } {
  return AUDIT_LABELS[action] ?? { label: action, severity: "therapist" };
}
