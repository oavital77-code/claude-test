import { cn } from "@/lib/utils";
import type { Holiday, HolidayKind, HolidayMap } from "@/lib/holiday-types";

// תצוגת חגים — משותפת ללוח המטפל/ת (/schedule) וללוח האדמין (/admin/board),
// באותו אופן שבו availability-grid משותף לשניהם. שתי רמות בלבד: יום טוב
// בולט (בפועל רוב המטפלים לא עובדים), וכל שאר המועדים עדינים — כדי שהלוח
// לא יהפוך לקרנבל צבעים בחודש תשרי.

const CHAG_STYLE = "bg-amber-100 text-amber-900 font-medium dark:bg-amber-950/60 dark:text-amber-200";
const OTHER_STYLE = "bg-muted text-muted-foreground";

// סדר חשיבות כשיש כמה מועדים באותו יום (נדיר, אבל קורה) — בתא צר מציגים
// רק את הראשון.
const PRIORITY: HolidayKind[] = ["chag", "erev", "national", "cholHamoed", "minor"];

export function hasChag(list: Holiday[] | undefined): boolean {
  return (list ?? []).some((h) => h.kind === "chag");
}

function primary(list: Holiday[] | undefined): Holiday | null {
  if (!list || list.length === 0) return null;
  return [...list].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))[0];
}

/** שמות קצרים כמחרוזת אחת — לכותרת עמודה בתצוגה השבועית (רוחב ≈ 112px). */
export function holidaySublabel(holidays: HolidayMap, dateYmd: string): string | null {
  const list = holidays[dateYmd];
  return list && list.length > 0 ? list.map((h) => h.shortName).join(" · ") : null;
}

/** תצוגת יום — יש מקום, מציגים את כל המועדים בשמם המלא. */
export function HolidayTags({
  holidays,
  dateYmd,
  className,
}: {
  holidays: HolidayMap;
  dateYmd: string;
  className?: string;
}) {
  const list = holidays[dateYmd];
  if (!list || list.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {list.map((h) => (
        <span
          key={h.name}
          className={cn("rounded-sm px-1.5 text-[11px] leading-5", h.kind === "chag" ? CHAG_STYLE : OTHER_STYLE)}
        >
          {h.name}
        </span>
      ))}
    </span>
  );
}

/**
 * תצוגה חודשית — תא של ≈ 55px בטלפון. תגית **אחת** בלבד, בשם הקצר, ברוחב
 * מלא, שגולשת לשורה שנייה במקום להיחתך באמצע מילה ("ראש הש…" היה הבאג
 * שהביא לכאן). ה-title מחזיק את השמות המלאים.
 */
export function MonthHolidayTag({ holidays, dateYmd }: { holidays: HolidayMap; dateYmd: string }) {
  const list = holidays[dateYmd];
  const h = primary(list);
  if (!h || !list) return null;
  return (
    <span
      title={list.map((x) => x.name).join(" · ")}
      className={cn(
        "block w-full rounded-sm px-1 py-0.5 text-center text-[10px] leading-tight break-words",
        h.kind === "chag" ? CHAG_STYLE : OTHER_STYLE,
      )}
    >
      {h.shortName}
    </span>
  );
}
