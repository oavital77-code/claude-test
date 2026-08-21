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
  blocked: "bg-zinc-800 dark:bg-zinc-700",
};

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
    </div>
  );
}

export function AvailabilityGrid({
  columns,
  slots,
  statusFor,
  onSlotClick,
  isSelected,
}: {
  columns: GridColumn[];
  slots: Slot[];
  statusFor: (columnKey: string, slot: Slot) => SlotStatus;
  onSlotClick: (columnKey: string, slot: Slot, status: SlotStatus) => void;
  isSelected?: (columnKey: string, slot: Slot) => boolean;
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
                const isFree = status === "free";
                const selected = isSelected?.(col.key, slot) ?? false;
                return (
                  <div
                    key={col.key}
                    role={isFree ? "button" : undefined}
                    tabIndex={isFree ? 0 : undefined}
                    onClick={() => isFree && onSlotClick(col.key, slot, status)}
                    onKeyDown={(e) => {
                      if (isFree && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onSlotClick(col.key, slot, status);
                      }
                    }}
                    className={cn(
                      "h-5 border-b border-l last:border-l-0",
                      isFree && "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                      STATUS_STYLES[status],
                      selected && "ring-2 ring-inset ring-primary",
                    )}
                  />
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
