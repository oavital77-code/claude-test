/**
 * ניתוח קובץ לו״ז שהאדמין מעלה (CSV/TSV) לשורות מובנות.
 *
 * פונקציה טהורה בלי גישה ל-DB או לרשת — כדי שתהיה ניתנת לבדיקת יחידה,
 * ושהאימות מול החדרים/ההתנגשויות יישאר בשכבה שמעליה.
 *
 * מתמודד עם מה שקורה בפועל כשמייצאים מאקסל בעברית:
 *   • BOM בתחילת הקובץ (אקסל תמיד מוסיף ב-UTF-8 CSV) — אחרת הכותרת
 *     הראשונה לא מזוהה כי היא מתחילה בתו בלתי נראה.
 *   • מפריד ; במקום , (ברירת המחדל של אקסל בלוקאל ישראלי) או טאב.
 *   • מרכאות סביב שדות שמכילים את המפריד.
 *   • סיומות שורה של חלונות (\r\n).
 */

export type ParsedRow = {
  /** מספר השורה בקובץ כפי שהמשתמש רואה אותה (כולל שורת הכותרת). */
  rowNumber: number;
  therapistName: string;
  email: string | null;
  roomName: string;
  /** yyyy-MM-dd */
  date: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
};

export type RowError = { rowNumber: number; message: string };

export type ParseResult = {
  rows: ParsedRow[];
  errors: RowError[];
  /** כותרות שלא זוהו — מוצג לאדמין כדי שיבין למה עמודה לא נקלטה. */
  unknownHeaders: string[];
};

/** ברירת מחדל כשאין עמודת שעת סיום: מפגש בן שעה. */
const DEFAULT_DURATION_MINUTES = 60;

const HEADER_ALIASES: Record<keyof Omit<ParsedRow, "rowNumber">, string[]> = {
  therapistName: ["שם", "שם מלא", "שם מטפל", "שם מטפלת", "שם המטפל", "מטפל", "מטפלת", "name", "full name", "therapist"],
  email: ["מייל", "אימייל", "דואר אלקטרוני", "email", "e-mail", "mail"],
  roomName: ["חדר", "שם חדר", "room", "room name"],
  date: ["תאריך", "date", "day"],
  startTime: ["שעה", "משעה", "שעת התחלה", "התחלה", "start", "start time", "from", "time"],
  endTime: ["עד שעה", "שעת סיום", "סיום", "end", "end time", "to", "until"],
};

/** מפצל שורת CSV בודדת תוך כיבוד מרכאות כפולות ("" = מרכאה בתוך שדה). */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(field.trim());
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field.trim());
  return out;
}

/** בוחר את המפריד שמייצר הכי הרבה עמודות בשורת הכותרת. */
function detectDelimiter(headerLine: string): string {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    const count = splitLine(headerLine, d).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/** yyyy-MM-dd, או null אם לא ניתן לפענח. */
export function normalizeDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // ISO: yyyy-MM-dd (גם עם / )
  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  // ישראלי: dd/MM/yyyy — יום לפני חודש, כמו בכל שאר המערכת
  const local = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (local) {
    const year = Number(local[3]) < 100 ? 2000 + Number(local[3]) : Number(local[3]);
    return buildDate(year, Number(local[2]), Number(local[1]));
  }

  return null;
}

function buildDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // בדיקת קיום אמיתית (31/02 וכו')
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** HH:mm, או null אם לא ניתן לפענח. */
export function normalizeTime(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const m = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nextH = Math.floor(total / 60) % 24;
  const nextM = total % 60;
  return `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;
}

export function parseScheduleFile(text: string): ParseResult {
  // אקסל כותב BOM בתחילת CSV; בלי הסרה הכותרת הראשונה לא מזוהה.
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [{ rowNumber: 0, message: "הקובץ ריק" }], unknownHeaders: [] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter).map(normalizeHeader);

  // מיפוי שם עמודה → אינדקס
  const columnIndex: Partial<Record<keyof Omit<ParsedRow, "rowNumber">, number>> = {};
  const matched = new Set<number>();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
    keyof Omit<ParsedRow, "rowNumber">,
    string[],
  ][]) {
    const idx = headers.findIndex((h, i) => !matched.has(i) && aliases.includes(h));
    if (idx >= 0) {
      columnIndex[field] = idx;
      matched.add(idx);
    }
  }

  const unknownHeaders = headers.filter((h, i) => !matched.has(i) && h.length > 0);

  const missing: string[] = [];
  if (columnIndex.therapistName === undefined) missing.push("שם מטפל/ת");
  if (columnIndex.roomName === undefined) missing.push("חדר");
  if (columnIndex.date === undefined) missing.push("תאריך");
  if (columnIndex.startTime === undefined) missing.push("שעה");

  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, message: `חסרות עמודות חובה בכותרת: ${missing.join(", ")}` }],
      unknownHeaders,
    };
  }

  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1; // שורה 1 היא הכותרת
    const cells = splitLine(lines[i], delimiter);
    const at = (field: keyof Omit<ParsedRow, "rowNumber">) => {
      const idx = columnIndex[field];
      return idx === undefined ? "" : (cells[idx] ?? "").trim();
    };

    const therapistName = at("therapistName");
    const roomName = at("roomName");
    const date = normalizeDate(at("date"));
    const startTime = normalizeTime(at("startTime"));
    const rawEnd = at("endTime");
    const endTime = rawEnd ? normalizeTime(rawEnd) : addMinutes(startTime ?? "00:00", DEFAULT_DURATION_MINUTES);

    if (!therapistName) {
      errors.push({ rowNumber, message: "חסר שם מטפל/ת" });
      continue;
    }
    if (!roomName) {
      errors.push({ rowNumber, message: "חסר שם חדר" });
      continue;
    }
    if (!date) {
      errors.push({ rowNumber, message: `תאריך לא תקין: "${at("date")}"` });
      continue;
    }
    if (!startTime) {
      errors.push({ rowNumber, message: `שעת התחלה לא תקינה: "${at("startTime")}"` });
      continue;
    }
    if (!endTime) {
      errors.push({ rowNumber, message: `שעת סיום לא תקינה: "${rawEnd}"` });
      continue;
    }
    if (endTime <= startTime) {
      errors.push({ rowNumber, message: `שעת הסיום (${endTime}) אינה אחרי שעת ההתחלה (${startTime})` });
      continue;
    }

    const email = at("email").toLowerCase() || null;

    rows.push({ rowNumber, therapistName, email, roomName, date, startTime, endTime });
  }

  return { rows, errors, unknownHeaders };
}
