"use client";

import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { TIMEZONE } from "@/lib/time";
import type { Slot } from "@/lib/availability/grid";
import type { SlotStatus } from "@/lib/availability/types";

export interface GridColumn {
  key: string;
  label: string;
}

const STATUS_STYLES: Record<SlotStatus, string> = {
  free: "bg-emerald-100 hover:bg-emerald-200 cursor-pointer dark:bg-emerald-950 dark:hover:bg-emerald-900",
  taken: "bg-muted",
  mine: "bg-blue-200 dark:bg-blue-900",
  // רקע כהה — הטקסט חייב להיות בהיר במפורש, אחרת הוא יורש את צבע הגוף
  // ונבלע ברקע (חסימה עם reason ארוך הייתה בלתי קריאה בלוח האדמין).
  blocked: "bg-zinc-800 text-zinc-50 dark:bg-zinc-700 dark:text-zinc-50",
};

// צבעים לפי סוג הזמנה (ססיה/כרטיסייה) — רכים ולא רוויים בכוונה ("לא צועק").
// מוצג רק היכן שסוג ההזמנה גלוי לצופה: הלוח המלא של האדמין, וההזמנות
// של המטפל/ת עצמו/ה בלוח שלו/ה. לעולם לא על הזמנה "תפוסה" של מטפל אחר —
// public_availability לא חושף source בכלל (CLAUDE.md: אין סוג הזמנה).
export const SESSION_COLOR = "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200";
export const CARD_COLOR = "bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200";

export function Legend() {
  const items: { status: SlotStatus; label: string }[] = [
    { status: "free", label: "פנוי" },
    { status: "taken", label: "תפוס" },
    { status: "mine", label: "ההזמנה שלי" },
    { status: "blocked", label: "לא זמין" },
  ];
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      {items.map((item) => (
        <div key={item.status} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded-sm", STATUS_STYLES[item.status])} />
          {item.label}
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className={cn("size-3 rounded-sm", SESSION_COLOR)} />
        ססיה
      </div>
      <div className="flex items-center gap-1.5">
        <span className={cn("size-3 rounded-sm", CARD_COLOR)} />
        כרטיסייה
      </div>
    </div>
  );
}

export function AvailabilityGrid({
  columns,
  slots,
  statusFor,
  onSlotClick,
  isSelected,
  titleFor,
  labelFor,
  colorFor,
  rowHeightClass = "h-5",
}: {
  columns: GridColumn[];
  slots: Slot[];
  statusFor: (columnKey: string, slot: Slot) => SlotStatus;
  onSlotClick?: (columnKey: string, slot: Slot, status: SlotStatus) => void;
  isSelected?: (columnKey: string, slot: Slot) => boolean;
  /** טקסט tooltip (title) לתא — למשל שם המטפל/ת בתא תפוס, לתצוגות read-only. */
  titleFor?: (columnKey: string, slot: Slot, status: SlotStatus) => string | undefined;
  /** טקסט קבוע בתוך התא (למשל שם קצר) — בניגוד ל-titleFor שדורש ריחוף. */
  labelFor?: (columnKey: string, slot: Slot, status: SlotStatus) => string | undefined;
  /** דריסת צבע התא (למשל לפי סוג הזמנה) — ברירת המחדל היא STATUS_STYLES[status]. */
  colorFor?: (columnKey: string, slot: Slot, status: SlotStatus) => string | undefined;
  /** גובה שורה — ברירת מחדל h-5 (מתאים ללוח המטפל בלי טקסט); לוח עם labelFor כדאי גבוה יותר. */
  rowHeightClass?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `56px repeat(${columns.length}, minmax(84px, 1fr))`,
        }}
      >
        <div className="sticky top-0 z-10 border-b border-l bg-background" />
        {columns.map((col) => (
          <div
            key={col.key}
            className="sticky top-0 z-10 border-b border-l bg-background p-2 text-center text-xs font-medium last:border-l-0"
          >
            {col.label}
          </div>
        ))}

        {slots.map((slot, i) => {
          const isHour = slot.start.getUTCMinutes() % 60 === 0 || i === 0;
          return (
            <FragmentRow key={slot.start.toISOString()}>
              <div className="border-l p-1 text-left text-[10px] text-muted-foreground">
                {isHour ? formatInTimeZone(slot.start, TIMEZONE, "HH:mm") : ""}
              </div>
              {columns.map((col) => {
                const status = statusFor(col.key, slot);
                const isFree = status === "free" && Boolean(onSlotClick);
                const selected = isSelected?.(col.key, slot) ?? false;
                const label = labelFor?.(col.key, slot, status);
                const colorOverride = colorFor?.(col.key, slot, status);
                return (
                  <div
                    key={col.key}
                    role={isFree ? "button" : undefined}
                    tabIndex={isFree ? 0 : undefined}
                    title={titleFor?.(col.key, slot, status)}
                    onClick={() => isFree && onSlotClick?.(col.key, slot, status)}
                    onKeyDown={(e) => {
                      if (isFree && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onSlotClick?.(col.key, slot, status);
                      }
                    }}
                    className={cn(
                      rowHeightClass,
                      "flex items-center overflow-hidden border-b border-l last:border-l-0",
                      isFree && "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                      colorOverride ?? STATUS_STYLES[status],
                      selected && "ring-2 ring-inset ring-primary",
                    )}
                  >
                    {label && (
                      <span className="truncate px-1 text-[9px] leading-none text-foreground/80 select-none">
                        {label}
                      </span>
                    )}
                  </div>
                );
              })}
            </FragmentRow>
          );
        })}
      </div>
    </div>
  );
}

// עוזר קטן כדי לפרוס תא-זמן + שורת תאים בתוך אותו grid שטוח בלי עטיפת div נוספת שתשבור את העמודות.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
