"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type KeyboardEvent } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { TIMEZONE } from "@/lib/time";
import type { AvailabilityInterval } from "@/lib/availability/types";
import {
  DAY_END,
  DAY_START,
  STEP,
  columnBlocks,
  defaultFrame,
  dragTo,
  extendSelection,
  firstFreeFrame,
  place,
  resizeTo,
  toInstants,
  toSpan,
  toTime,
  type Proposal,
  type Span,
} from "@/lib/schedule/time-grid";
import { SESSION_COLOR, CARD_COLOR } from "./availability-grid";

export interface TimeGridColumn {
  key: string;
  label: string;
  sublabel?: string | null;
  highlight?: boolean;
  /** התאריך המקומי (yyyy-MM-dd) של העמודה. */
  dateStr: string;
  roomId: string;
}

type Selected = { columnKey: string; start: Date; end: Date } | null;

type Drag = {
  pointerId: number;
  y: number;
  mode: "move" | "start" | "end";
  from: Span;
  active: boolean;
  base: { top: number; height: number };
  column: TimeGridColumn;
  busy: Span[];
};

// אותם צבעים כמו הלוח הישן (availability-grid.tsx), כדי שהמקרא נשאר נכון.
const FREE_BG = "bg-emerald-100 dark:bg-emerald-950";
const UNAVAILABLE = "bg-zinc-800 text-zinc-50 dark:bg-zinc-700 dark:text-zinc-50";
const MINE_DEFAULT = "bg-blue-200 dark:bg-blue-900";

/** מכשיר בלי ריחוף (טלפון/טאבלט) — אין תצוגה מקדימה, יש תווית "גוררים". */
function useNoHover() {
  const [noHover, setNoHover] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none)");
    const update = () => setNoHover(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return noHover;
}

/**
 * לוח לפי קנה מידה (כל שעה באותו גובה, כל הזמנה בגובה של האורך שלה) לתצוגת
 * יום/שבוע של המטפל/ת. ריחוף מראה איפה תיפתח מסגרת, לחיצה/הקשה פותחת אותה,
 * גרירה מזיזה ומתיחה מהפסים מאריכה/מקצרת — הכול בחצאי שעות.
 *
 * הלוח רק בוחר טווח: onSelect מקבל (עמודה, התחלה, סיום) — בדיוק מה שהלוח
 * הישן העביר — והאישור עצמו נשאר ב-SlotPreview → bookSlot → create_booking.
 */
export function TimeGrid({
  columns,
  intervalsFor,
  fullName,
  selected,
  onSelect,
  onDraggingChange,
}: {
  columns: TimeGridColumn[];
  intervalsFor: (column: TimeGridColumn) => AvailabilityInterval[] | undefined;
  fullName: string;
  selected: Selected;
  onSelect: (columnKey: string, start: Date, end: Date) => void;
  onDraggingChange?: (dragging: boolean) => void;
}) {
  const touchUi = useNoHover();
  const hourHeight = touchUi ? 56 : 48;
  const height = ((DAY_END - DAY_START) / 60) * hourHeight;
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START / 60 + i);
  const minColumn = columns.some((c) => c.sublabel) ? 112 : 84;

  const [hover, setHover] = useState<(Proposal & { key: string }) | null>(null);
  const [live, setLive] = useState<Proposal | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<Drag | null>(null);
  const liveRef = useRef<Proposal | null>(null);

  const blocksByColumn = new Map(columns.map((c) => [c.key, columnBlocks(c.dateStr, intervalsFor(c))]));
  const selectedColumn = selected ? columns.find((c) => c.key === selected.columnKey) : undefined;
  const selectedSpan = selected && selectedColumn ? toSpan(selectedColumn.dateStr, selected.start, selected.end) : null;

  function tappedMinutes(e: { clientY: number; currentTarget: HTMLElement }) {
    const rect = e.currentTarget.getBoundingClientRect();
    return DAY_START + ((e.clientY - rect.top) / hourHeight) * 60;
  }

  function select(column: TimeGridColumn, span: Span) {
    const { start, end } = toInstants(column.dateStr, span);
    onSelect(column.key, start, end);
  }

  function onEmptyMove(column: TimeGridColumn, e: PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === "touch" || touchUi || dragRef.current) return;
    const busy = blocksByColumn.get(column.key)?.busy ?? [];
    const p = defaultFrame(busy, tappedMinutes(e));
    if (hover && hover.key === column.key && hover.start === p.start && hover.end === p.end && hover.fits === p.fits) return;
    setHover({ key: column.key, ...p });
  }

  function onEmptyClick(column: TimeGridColumn, e: MouseEvent<HTMLButtonElement>) {
    setHover(null);
    const busy = blocksByColumn.get(column.key)?.busy ?? [];
    // מקלדת (Enter/רווח) — אין מיקום: המסגרת הפנויה הראשונה מ-09:00.
    if (e.detail === 0) {
      const p = firstFreeFrame(busy, 9 * 60);
      if (p) select(column, p);
      return;
    }
    const tapped = tappedMinutes(e);
    // כמו בלוח הישן: לחיצה נוספת באותה עמודה מרחיבה את הבחירה עד חצי השעה
    // שנלחצה, אם כל הטווח המאוחד פנוי.
    if (selectedSpan && selected?.columnKey === column.key) {
      const half = Math.floor(tapped / STEP) * STEP;
      const ext = extendSelection(busy, selectedSpan, { start: half, end: half + STEP });
      if (ext) return select(column, ext);
    }
    const p = defaultFrame(busy, tapped);
    if (p.fits) select(column, p);
  }

  function onGhostDown(column: TimeGridColumn, e: PointerEvent<HTMLButtonElement>) {
    if (!selectedSpan) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const edge = (e.target as HTMLElement).closest<HTMLElement>("[data-edge]");
    e.currentTarget.setPointerCapture(e.pointerId);
    const box = place(selectedSpan.start, selectedSpan.end, hourHeight);
    dragRef.current = {
      pointerId: e.pointerId,
      y: e.clientY,
      mode: edge ? (edge.dataset.edge as "start" | "end") : "move",
      from: selectedSpan,
      active: false,
      base: { top: box.top + 1, height: box.height - 2 },
      column,
      busy: blocksByColumn.get(column.key)?.busy ?? [],
    };
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
  }

  function onGhostMove(e: PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    let dy = e.clientY - d.y;
    if (!d.active) {
      // סף של 4px — הקשה רגילה על המסגרת לא מזיזה אותה.
      if (Math.abs(dy) < 4) return;
      d.active = true;
      setDragging(true);
      setHover(null);
      onDraggingChange?.(true);
    }
    // תנועה חלקה עם האצבע: style ישירות על האלמנט, בלי רינדור לכל פיקסל.
    const el = e.currentTarget;
    const b = d.base;
    if (d.mode === "move") {
      dy = Math.max(-b.top, Math.min(height - b.top - b.height, dy));
      el.style.transform = `translateY(${dy}px)`;
    } else if (d.mode === "start") {
      dy = Math.max(-b.top, Math.min(b.height - 14, dy));
      el.style.top = `${b.top + dy}px`;
      el.style.height = `${b.height - dy}px`;
    } else {
      dy = Math.max(14 - b.height, Math.min(height - b.top - b.height, dy));
      el.style.height = `${b.height + dy}px`;
    }
    const moved = (dy / hourHeight) * 60;
    const land = d.mode === "move" ? dragTo(d.busy, d.from, moved) : resizeTo(d.busy, d.from, d.mode, moved);
    const prev = liveRef.current;
    if (!prev || prev.start !== land.start || prev.end !== land.end || prev.fits !== land.fits) {
      liveRef.current = land;
      setLive(land);
    }
  }

  function onGhostUp(e: PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    if (!d.active) return;
    const landed = liveRef.current;
    // נחיתה על זמן לא פנוי → חוזרים למקום הקודם (לעולם לא בוחרים טווח תפוס).
    const target = landed && landed.fits ? landed : d.from;
    // כותבים top/height במפורש: React לא כותב מחדש ערך שלא השתנה, ומסגרת
    // שנמתחה מהתחתית (אותו top) הייתה נשארת בלי top ו"נעלמת".
    const box = place(target.start, target.end, hourHeight);
    const el = e.currentTarget;
    el.style.transform = "";
    el.style.top = `${box.top + 1}px`;
    el.style.height = `${box.height - 2}px`;
    liveRef.current = null;
    setLive(null);
    setDragging(false);
    onDraggingChange?.(false);
    if (target.start !== d.from.start || target.end !== d.from.end) select(d.column, target);
  }

  function onGhostKey(column: TimeGridColumn, e: KeyboardEvent<HTMLButtonElement>) {
    if (!selectedSpan || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const busy = blocksByColumn.get(column.key)?.busy ?? [];
    const p = dragTo(busy, selectedSpan, e.key === "ArrowUp" ? -STEP : STEP);
    if (p.fits) select(column, p);
  }

  return (
    <div className="flex w-full min-w-0 overflow-hidden rounded-md border border-border">
      {/* השעות — מחוץ לגלילה האופקית, כך שהן לא נעלמות כשגוללים בין חדרים. */}
      <div aria-hidden className="w-12 shrink-0 border-l border-border bg-background">
        <div className="h-14 border-b border-border" />
        <div className="relative" style={{ height }}>
          {hours.map((hour, i) => (
            <span
              key={hour}
              dir="ltr"
              className={cn(
                "absolute end-1.5 text-[10px] leading-none text-muted-foreground tabular-nums",
                i === 0 ? "top-1" : i === hours.length - 1 ? "-translate-y-full" : "-translate-y-1/2",
              )}
              style={i === 0 ? undefined : { top: (hour * 60 - DAY_START) / 60 * hourHeight }}
            >
              {toTime(hour * 60)}
            </span>
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(${minColumn}px, 1fr))` }}
        >
          {columns.map((col) => (
            <div
              key={`h-${col.key}`}
              title={col.sublabel ?? undefined}
              className={cn(
                "flex h-14 flex-col justify-center gap-0.5 border-b border-l border-border p-2 text-center last:border-l-0",
                col.highlight ? "bg-amber-100 dark:bg-amber-950" : "bg-background",
              )}
            >
              <span className="text-xs font-medium">{col.label}</span>
              {col.sublabel && (
                <span
                  className={cn(
                    "line-clamp-2 text-[10px] leading-tight",
                    col.highlight ? "font-medium text-amber-900 dark:text-amber-200" : "text-muted-foreground",
                  )}
                >
                  {col.sublabel}
                </span>
              )}
            </div>
          ))}

          {columns.map((col) => {
            const blocks = blocksByColumn.get(col.key)!;
            const isSelectedCol = selectedSpan && selected?.columnKey === col.key;
            const shown = isSelectedCol ? (live ?? { ...selectedSpan, fits: true }) : null;
            const ghostBox = isSelectedCol ? place(selectedSpan.start, selectedSpan.end, hourHeight) : null;
            const short = ghostBox ? ghostBox.height < 40 : false;
            return (
              <div key={col.key} className={cn("relative border-l border-emerald-300 last:border-l-0 dark:border-emerald-800", FREE_BG)} style={{ height }}>
                {hours.map((hour) => (
                  <div
                    key={hour}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 border-t border-emerald-300 dark:border-emerald-800"
                    style={{ top: ((hour * 60 - DAY_START) / 60) * hourHeight }}
                  />
                ))}
                {hours.slice(0, -1).map((hour) => (
                  <div
                    key={`half-${hour}`}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 border-t border-dashed border-emerald-300/60 dark:border-emerald-900"
                    style={{ top: ((hour * 60 + 30 - DAY_START) / 60) * hourHeight }}
                  />
                ))}

                {/* זמן פנוי: כפתור שקוף מתחת להזמנות. */}
                <button
                  type="button"
                  aria-label={`קביעת תור ב${col.label}`}
                  className="absolute inset-0 z-[1] cursor-copy focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:outline-none"
                  onPointerMove={(e) => onEmptyMove(col, e)}
                  onPointerLeave={() => setHover(null)}
                  onClick={(e) => onEmptyClick(col, e)}
                />

                {blocks.unavailable.map((s) => {
                  const box = place(s.start, s.end, hourHeight);
                  return (
                    <div
                      key={`u-${s.start}`}
                      className={cn("absolute inset-x-1 z-[2] overflow-hidden rounded-sm px-1.5 py-0.5", UNAVAILABLE)}
                      style={{ top: box.top + 1, height: box.height - 2 }}
                    >
                      <span className="text-[10px] leading-none opacity-90 select-none">לא זמין</span>
                    </div>
                  );
                })}

                {blocks.mine.map((s) => {
                  const box = place(s.start, s.end, hourHeight);
                  const color = s.source === "session" ? SESSION_COLOR : s.source === "punch_card" ? CARD_COLOR : MINE_DEFAULT;
                  const from = formatInTimeZone(s.startsAt, TIMEZONE, "HH:mm");
                  const to = formatInTimeZone(s.endsAt, TIMEZONE, "HH:mm");
                  return (
                    <div
                      key={`m-${s.start}`}
                      title={`${fullName} · ${from}–${to}`}
                      className={cn("absolute inset-x-1 z-[2] overflow-hidden rounded-sm px-1.5 py-0.5", color)}
                      style={{ top: box.top + 1, height: box.height - 2 }}
                    >
                      <span className="block truncate text-[10px] leading-tight font-medium select-none">
                        {fullName} · <span dir="ltr">{from}–{to}</span>
                      </span>
                    </div>
                  );
                })}

                {hover && hover.key === col.key && !dragging && (() => {
                  const box = place(hover.start, hover.end, hourHeight);
                  return (
                    <div
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute inset-x-1 z-[3] flex items-center justify-center overflow-hidden rounded-sm border-2 border-dashed text-xs font-bold whitespace-nowrap",
                        hover.fits
                          ? "border-primary/70 bg-primary/10 text-violet-700 dark:text-violet-300"
                          : "border-zinc-400 bg-zinc-400/10 text-muted-foreground",
                      )}
                      style={{ top: box.top + 1, height: box.height - 2 }}
                    >
                      {hover.fits ? <span dir="ltr">+ {toTime(hover.start)}–{toTime(hover.end)}</span> : "לא זמין"}
                    </div>
                  );
                })()}

                {isSelectedCol && ghostBox && shown && (
                  <>
                    <button
                      type="button"
                      data-selected="true"
                      aria-label={`נבחר ${toTime(shown.start)} עד ${toTime(shown.end)}. גוררים כדי להזיז, מותחים מהפסים כדי לשנות את האורך, חיצים מזיזים בחצי שעה`}
                      className={cn(
                        "absolute inset-x-1 z-[5] flex touch-none items-center justify-center rounded-sm border-2 border-dashed bg-background/90 p-0 text-xs font-extrabold select-none",
                        dragging ? "cursor-grabbing shadow-e2" : "cursor-grab shadow-e1",
                        shown.fits ? "border-primary text-violet-700 dark:text-violet-300" : "border-zinc-400 text-muted-foreground",
                      )}
                      style={{ top: ghostBox.top + 1, height: ghostBox.height - 2 }}
                      onPointerDown={(e) => onGhostDown(col, e)}
                      onPointerMove={onGhostMove}
                      onPointerUp={onGhostUp}
                      onPointerCancel={onGhostUp}
                      onKeyDown={(e) => onGhostKey(col, e)}
                    >
                      <span
                        data-edge="start"
                        className={cn("absolute inset-x-0 flex cursor-ns-resize items-center justify-center", short ? "-top-2 h-4" : "-top-3 h-6")}
                      >
                        <i className={cn("rounded-full ring-2 ring-background", short ? "h-1 w-7" : "h-1.5 w-10", shown.fits ? "bg-primary" : "bg-zinc-400")} />
                      </span>
                      <span dir="ltr" className="pointer-events-none leading-none whitespace-nowrap">
                        {shown.fits ? `${toTime(shown.start)}–${toTime(shown.end)}` : "לא זמין"}
                      </span>
                      <span
                        data-edge="end"
                        className={cn("absolute inset-x-0 flex cursor-ns-resize items-center justify-center", short ? "-bottom-2 h-4" : "-bottom-3 h-6")}
                      >
                        <i className={cn("rounded-full ring-2 ring-background", short ? "h-1 w-7" : "h-1.5 w-10", shown.fits ? "bg-primary" : "bg-zinc-400")} />
                      </span>
                    </button>
                    {touchUi && !dragging && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-1/2 z-[6] -translate-x-1/2 rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-white dark:bg-zinc-100 dark:text-zinc-900"
                        style={{ top: ghostBox.top < 30 ? ghostBox.top + ghostBox.height + 8 : ghostBox.top - 26 }}
                      >
                        גוררים ↕
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
