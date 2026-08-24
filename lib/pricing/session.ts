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
