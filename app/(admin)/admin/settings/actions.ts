"use server";

import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { TIMEZONE } from "@/lib/time";
import { parseScheduleFile, type RowError } from "@/lib/schedule-import/parse";
import { FILE_IMPORT_MARKER } from "@/lib/skedda-import/group";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateAppSettingAction(key: string, value: number): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z.number().finite().safeParse(value);
  if (!parsed.success) return { ok: false, error: "ערך לא תקין" };

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").update({ value: parsed.data }).eq("key", key);
  if (error) return { ok: false, error: "השמירה נכשלה" };
  return { ok: true };
}

export type ResetSystemResult =
  | {
      ok: true;
      therapists: number;
      bookings: number;
      rooms: number;
      branches: number;
    }
  | { ok: false; error: string };

/**
 * ⚠️ הרסני ובלתי הפיך. ר' 20260914000001_reset_system_to_zero.sql —
 * הבדיקות האמיתיות (אדמין, מילת אישור, נעילה אחרי השקה) נאכפות בתוך ה-RPC
 * עצמו, לא כאן, כדי שלא יהיה שום מסלול לעקוף אותן.
 */
export async function resetSystemToZeroAction(confirmation: string): Promise<ResetSystemResult> {
  await requireAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reset_system_to_zero", {
    p_confirmation: confirmation,
  });

  if (error) {
    const code = error.message ?? "";
    if (code.includes("RESET_LOCKED")) {
      return {
        ok: false,
        error: "האיפוס נעול: כבר בוצע במערכת תשלום אמיתי ע\"י משתמש/ת. לא ניתן למחוק מערכת פעילה.",
      };
    }
    if (code.includes("INVALID_CONFIRMATION")) {
      return { ok: false, error: "מילת האישור שהוקלדה אינה נכונה" };
    }
    if (code.includes("FORBIDDEN")) {
      return { ok: false, error: "אין לך הרשאה לבצע איפוס" };
    }
    return { ok: false, error: "האיפוס נכשל. שום דבר לא נמחק." };
  }

  const summary = data as {
    therapists_deleted: number;
    bookings_deleted: number;
    rooms_deleted: number;
    branches_deleted: number;
  };

  return {
    ok: true,
    therapists: summary.therapists_deleted,
    bookings: summary.bookings_deleted,
    rooms: summary.rooms_deleted,
    branches: summary.branches_deleted,
  };
}

export type ScheduleImportResult =
  | {
      ok: true;
      dryRun: boolean;
      /** שורות נתונים בקובץ (בלי הכותרת). */
      totalRows: number;
      /** שורות שעברו את כל הבדיקות ומוכנות לכתיבה. */
      readyCount: number;
      /** נכתבו בפועל (0 בתצוגה מקדימה). */
      inserted: number;
      parseErrors: RowError[];
      conflicts: RowError[];
      unknownRooms: string[];
      unknownHeaders: string[];
    }
  | { ok: false; error: string };

/** השוואת שמות חדרים סלחנית — רווחים כפולים/רישיות לא אמורים להפיל ייבוא. */
function normalizeRoomName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * ייבוא לו״ז מקובץ CSV/TSV → חסימות חדר (`room_blocks`).
 *
 * חסימות ולא הזמנות אמיתיות, בכוונה: הזמנה מחייבת מטפל/ת עם חשבון וכרטיסייה
 * בתוקף (חוק ברזל #7), ובשלב הייבוא אף אחת מהן עוד לא נרשמה. אותו דפוס
 * בדיוק כמו הייבוא מ-Skedda — והחסימות שנוצרות כאן מופיעות באותו מסך
 * "קליטה מ-Skedda" בכרטיס המטפל/ת לצורך שיוך.
 *
 * `dryRun` מריץ את כל הבדיקות בלי לכתוב כלום. הצד השני קורא פעמיים עם אותו
 * טקסט — כך שגם ב"אישור" השרת מנתח מחדש ואינו סומך על נתונים מהלקוח.
 */
export async function importScheduleAction(
  fileText: string,
  dryRun: boolean,
): Promise<ScheduleImportResult> {
  const { userId } = await requireAdmin();

  if (typeof fileText !== "string" || fileText.trim().length === 0) {
    return { ok: false, error: "הקובץ ריק" };
  }

  const parsed = parseScheduleFile(fileText);
  if (parsed.rows.length === 0) {
    return {
      ok: true,
      dryRun,
      totalRows: 0,
      readyCount: 0,
      inserted: 0,
      parseErrors: parsed.errors,
      conflicts: [],
      unknownRooms: [],
      unknownHeaders: parsed.unknownHeaders,
    };
  }

  const supabase = await createClient();
  const { data: rooms } = await supabase.from("rooms").select("id, name").eq("active", true);
  const roomByName = new Map((rooms ?? []).map((r) => [normalizeRoomName(r.name), r.id]));

  type Candidate = {
    rowNumber: number;
    roomId: string;
    startsAt: Date;
    endsAt: Date;
    reason: string;
    imported_email: string | null;
  };

  const candidates: Candidate[] = [];
  const conflicts: RowError[] = [];
  const unknownRooms = new Set<string>();

  for (const row of parsed.rows) {
    const roomId = roomByName.get(normalizeRoomName(row.roomName));
    if (!roomId) {
      unknownRooms.add(row.roomName);
      conflicts.push({ rowNumber: row.rowNumber, message: `לא נמצא חדר פעיל בשם "${row.roomName}"` });
      continue;
    }

    // התאריך והשעה בקובץ הם שעון מקומי (Asia/Jerusalem) — ההמרה ל-UTC
    // חייבת לעבור דרך אזור הזמן, אחרת שעון קיץ יזיז את כל הלו״ז בשעה.
    const startsAt = fromZonedTime(`${row.date}T${row.startTime}:00`, TIMEZONE);
    const endsAt = fromZonedTime(`${row.date}T${row.endTime}:00`, TIMEZONE);

    // התנגשות בתוך הקובץ עצמו
    const clash = candidates.find(
      (c) => c.roomId === roomId && overlaps(c.startsAt, c.endsAt, startsAt, endsAt),
    );
    if (clash) {
      conflicts.push({
        rowNumber: row.rowNumber,
        message: `מתנגשת עם שורה ${clash.rowNumber} באותו חדר ובאותו זמן`,
      });
      continue;
    }

    candidates.push({
      rowNumber: row.rowNumber,
      roomId,
      startsAt,
      endsAt,
      reason: `${row.therapistName} · ${FILE_IMPORT_MARKER}`,
      imported_email: row.email,
    });
  }

  // התנגשות מול מה שכבר קיים במערכת, בטווח התאריכים של הקובץ בלבד
  if (candidates.length > 0) {
    const rangeStart = new Date(Math.min(...candidates.map((c) => c.startsAt.getTime())));
    const rangeEnd = new Date(Math.max(...candidates.map((c) => c.endsAt.getTime())));

    const [{ data: existingBlocks }, { data: existingBookings }] = await Promise.all([
      supabase
        .from("room_blocks")
        .select("room_id, starts_at, ends_at")
        .lt("starts_at", rangeEnd.toISOString())
        .gt("ends_at", rangeStart.toISOString()),
      supabase
        .from("bookings")
        .select("room_id, starts_at, ends_at")
        .eq("status", "confirmed")
        .lt("starts_at", rangeEnd.toISOString())
        .gt("ends_at", rangeStart.toISOString()),
    ]);

    const existing = [
      ...(existingBlocks ?? []).map((b) => ({ ...b, kind: "חסימה" })),
      ...(existingBookings ?? []).map((b) => ({ ...b, kind: "הזמנה" })),
    ];

    for (let i = candidates.length - 1; i >= 0; i--) {
      const c = candidates[i];
      const hit = existing.find(
        (e) =>
          e.room_id === c.roomId &&
          overlaps(c.startsAt, c.endsAt, new Date(e.starts_at), new Date(e.ends_at)),
      );
      if (hit) {
        conflicts.push({
          rowNumber: c.rowNumber,
          message: `המשבצת כבר תפוסה במערכת (${hit.kind} קיימת)`,
        });
        candidates.splice(i, 1);
      }
    }
  }

  conflicts.sort((a, b) => a.rowNumber - b.rowNumber);

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      totalRows: parsed.rows.length + parsed.errors.length,
      readyCount: candidates.length,
      inserted: 0,
      parseErrors: parsed.errors,
      conflicts,
      unknownRooms: [...unknownRooms],
      unknownHeaders: parsed.unknownHeaders,
    };
  }

  let inserted = 0;
  if (candidates.length > 0) {
    const { error } = await supabase.from("room_blocks").insert(
      candidates.map((c) => ({
        room_id: c.roomId,
        starts_at: c.startsAt.toISOString(),
        ends_at: c.endsAt.toISOString(),
        reason: c.reason,
        imported_email: c.imported_email,
        created_by: userId,
      })),
    );
    if (error) {
      return { ok: false, error: "הכתיבה נכשלה — שום שורה לא נוספה. ייתכן שיש התנגשות שלא נתפסה." };
    }
    inserted = candidates.length;
  }

  return {
    ok: true,
    dryRun: false,
    totalRows: parsed.rows.length + parsed.errors.length,
    readyCount: candidates.length,
    inserted,
    parseErrors: parsed.errors,
    conflicts,
    unknownRooms: [...unknownRooms],
    unknownHeaders: parsed.unknownHeaders,
  };
}

export async function updateTierPriceAction(
  tierId: string,
  pricePerHour: number,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z.number().positive().safeParse(pricePerHour);
  if (!parsed.success) return { ok: false, error: "מחיר לא תקין" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("punch_card_tiers")
    .update({ price_per_hour: parsed.data })
    .eq("id", tierId);
  if (error) return { ok: false, error: "השמירה נכשלה" };
  return { ok: true };
}
