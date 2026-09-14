import { toZonedTime } from "date-fns-tz";
import { TIMEZONE } from "@/lib/time";

/** מסמן חסימות שיובאו מ-Skedda (ר' 20260828000010_import_skedda_blocks.sql). */
export const SKEDDA_MARKER = "הועבר מ-Skedda";

/** מסמן חסימות שיובאו מקובץ CSV/אקסל דרך הגדרות → ייבוא לו״ז. */
export const FILE_IMPORT_MARKER = "יובא מקובץ";

/**
 * כל המסמנים של חסימות "מיובאות" — כלומר כאלה שממתינות לשיוך למטפל/ת
 * דרך מסך הקליטה. מקור הייבוא (Skedda או קובץ) לא משנה לתהליך השיוך.
 */
export const IMPORT_MARKERS = [SKEDDA_MARKER, FILE_IMPORT_MARKER] as const;

function isImportedBlock(reason: string): boolean {
  return IMPORT_MARKERS.some((marker) => reason.includes(marker));
}

export type SkeddaBlockRow = {
  id: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
};

export type SkeddaGroup = {
  /** הטקסט לפני ה-'·' ב-reason — שם המטפל/ת/ססיה כפי שנכתב ב-Skedda. */
  label: string;
  blocks: SkeddaBlockRow[];
  /** ניחוש ראשוני בלבד (על סמך "ססיה"/"sesia" בטקסט) — אדמין יכול לשנות. */
  looksLikeSession: boolean;
};

export function extractSkeddaLabel(reason: string): string {
  return reason.split("·")[0]?.trim() || reason.trim();
}

export function groupSkeddaBlocks(blocks: SkeddaBlockRow[]): SkeddaGroup[] {
  const byLabel = new Map<string, SkeddaBlockRow[]>();
  for (const block of blocks) {
    if (!isImportedBlock(block.reason)) continue;
    const label = extractSkeddaLabel(block.reason);
    const list = byLabel.get(label) ?? [];
    list.push(block);
    byLabel.set(label, list);
  }

  return [...byLabel.entries()]
    .map(([label, group]) => ({
      label,
      blocks: group.sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      looksLikeSession: /ססיה|sesia/i.test(label),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "he"));
}

export type DerivedSlot = {
  roomId: string;
  weekday: number;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
};

function timeOfDayInTz(iso: string): string {
  const zoned = toZonedTime(iso, TIMEZONE);
  return `${String(zoned.getHours()).padStart(2, "0")}:${String(zoned.getMinutes()).padStart(2, "0")}`;
}

/** משבצות ייחודיות (חדר/יום/שעה) מתוך כל המופעים שנבחרו — בסיס להצעה לססיה. */
export function deriveWeeklySlots(blocks: SkeddaBlockRow[]): DerivedSlot[] {
  const seen = new Map<string, DerivedSlot>();
  for (const block of blocks) {
    const weekday = toZonedTime(block.starts_at, TIMEZONE).getDay();
    const startTime = timeOfDayInTz(block.starts_at);
    const endTime = timeOfDayInTz(block.ends_at);
    const key = `${block.room_id}|${weekday}|${startTime}|${endTime}`;
    if (!seen.has(key)) {
      seen.set(key, { roomId: block.room_id, weekday, startTime, endTime });
    }
  }
  return [...seen.values()];
}
