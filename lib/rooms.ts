import type { Database } from "@/lib/supabase/types";

export type RoomType = Database["public"]["Enums"]["room_type"];

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  talk: "שיח",
  touch: "מגע",
  podcast: "פודקאסט",
  group: "קבוצתי",
};

/**
 * "חדר שיח" / "חדר מגע + שיח" — הכותרת שמופיעה מתחת לשם החדר בלוח.
 * `room_type` הוא מערך (חדר יכול לשמש גם לשיח וגם למגע), ולכן מחברים
 * את כל הסוגים שהוגדרו לחדר. מחזיר null לחדר בלי סוגים כדי שהקורא
 * פשוט לא יציג שורה ריקה.
 */
export function roomTypeLabel(types: RoomType[] | null | undefined): string | null {
  const labels = (types ?? []).map((t) => ROOM_TYPE_LABELS[t]).filter(Boolean);
  if (labels.length === 0) return null;
  return `חדר ${labels.join(" + ")}`;
}
