// תצוגה בלבד — המקור הסמכותי הוא ה-RPC request_session (ר' migrations).
// נוסחה: 600 + (weekly_hours − 5) × 110 (§3.2), תמחור שולי.
export function computeSessionMonthlyPrice(
  weeklyHours: number,
  baseHours: number,
  basePrice: number,
  marginalPrice: number,
): number {
  return basePrice + Math.max(0, weeklyHours - baseHours) * marginalPrice;
}

export interface SessionSlotDraft {
  roomId: string;
  roomName: string;
  weekday: number; // 0 = ראשון
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
}

export const WEEKDAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function slotHours(slot: Pick<SessionSlotDraft, "startTime" | "endTime">): number {
  const [sh, sm] = slot.startTime.split(":").map(Number);
  const [eh, em] = slot.endTime.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}
