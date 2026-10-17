import { formatDateHe, formatTimeHe } from "@/lib/time";

export const CANCELLATION_ACTIONS = new Set(["booking_cancelled", "booking_cancelled_by_admin"]);

export interface CancelledBooking {
  user_id: string;
  room_id: string;
  source: "punch_card" | "session" | "admin_comp";
  starts_at: string;
  ends_at: string;
  hours_charged: number;
  hours_refunded: boolean;
}

const SOURCE_LABELS: Record<CancelledBooking["source"], string> = {
  punch_card: "כרטיסייה",
  session: "ססיה",
  admin_comp: "הענקת אדמין",
};

/**
 * פרטי שורת ביטול ביומן הפעולות. ה-RPC רושם ב-audit_log רק hours_refunded,
 * אז החדר, המועד והשעות נשלפים מההזמנה עצמה. הסדר כאן הוא סדר התצוגה.
 * שם המטפל/ת רק בביטול ע"י אדמין — בביטול עצמי הוא כבר בעמודת "מי".
 */
export function cancellationDetails(booking: CancelledBooking, byAdmin: boolean): Record<string, unknown> {
  const start = new Date(booking.starts_at);
  const end = new Date(booking.ends_at);
  return {
    ...(byAdmin ? { user_id: booking.user_id } : {}),
    room_id: booking.room_id,
    booking_slot: `${formatDateHe(start)} ${formatTimeHe(start)}–${formatTimeHe(end)}`,
    source_label: SOURCE_LABELS[booking.source],
    // ססיה לא מחויבת בשעות — "הוחזרו: לא" שם רק מבלבל.
    ...(booking.source === "session"
      ? {}
      : { hours: Number(booking.hours_charged), hours_refunded: booking.hours_refunded }),
  };
}
