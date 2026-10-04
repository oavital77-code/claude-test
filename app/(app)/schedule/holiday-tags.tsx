import { cn } from "@/lib/utils";
import type { Holiday, HolidayMap } from "@/lib/holiday-types";

// תצוגת חגים — משותפת ללוח המטפל/ת (/schedule) וללוח האדמין (/admin/board),
// באותו אופן שבו availability-grid משותף לשניהם. שתי רמות בלבד: יום טוב
// בולט (בפועל רוב המטפלים לא עובדים), וכל שאר המועדים עדינים — כדי שהלוח
// לא יהפוך לקרנבל צבעים בחודש תשרי.

const CHAG_STYLE = "bg-amber-100 text-amber-900 font-medium dark:bg-amber-950/60 dark:text-amber-200";
const OTHER_STYLE = "bg-muted text-muted-foreground";

export function hasChag(list: Holiday[] | undefined): boolean {
  return (list ?? []).some((h) => h.kind === "chag");
}

/** שמות החגים כמחרוזת אחת — לכותרת עמודה בתצוגה השבועית. */
export function holidaySublabel(holidays: HolidayMap, dateYmd: string): string | null {
  const list = holidays[dateYmd];
  return list && list.length > 0 ? list.map((h) => h.name).join(" · ") : null;
}

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
          title={h.name}
          className={cn(
            "truncate rounded-sm px-1.5 text-[11px] leading-5",
            h.kind === "chag" ? CHAG_STYLE : OTHER_STYLE,
          )}
        >
          {h.name}
        </span>
      ))}
    </span>
  );
}
