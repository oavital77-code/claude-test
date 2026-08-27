"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { he } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { accessWindow, TIMEZONE } from "@/lib/time";
import {
  fetchRooms,
  fetchRoomAvailability,
  slotStatus,
  sourceAt,
  mineIntervalAt,
} from "@/lib/availability/queries";
import {
  daySlots,
  dayBoundaries,
  todayInIsrael,
  addDaysToDateStr,
  addMonthsToDateStr,
  startOfMonth,
  weekDatesStartingSunday,
  monthCalendarDates,
} from "@/lib/availability/grid";
import type { Database } from "@/lib/supabase/types";
import type { AvailabilityInterval, SlotStatus } from "@/lib/availability/types";
import type { Slot } from "@/lib/availability/grid";
import { Button } from "@/components/ui/button";
import { AvailabilityGrid, Legend, SESSION_COLOR, CARD_COLOR, type GridColumn } from "./availability-grid";
import { bookSlot } from "./actions";

type Branch = Database["public"]["Tables"]["branches"]["Row"];
type Room = Database["public"]["Tables"]["rooms"]["Row"];
type View = "day" | "week" | "month";

const ROOM_TYPE_LABELS: Record<Room["room_type"][number], string> = {
  talk: "שיח",
  touch: "מגע",
  podcast: "פודקאסט",
  group: "קבוצתי",
};

const WEEKDAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// צבע ייחודי לכל סניף (לפי סדר הופעה) — כדי שיהיה ברור מיד באיזה סניף
// מסתכלים / קבעו תור, בלי צורך בעמודת color נפרדת בטבלת branches.
const BRANCH_COLORS = [
  { dot: "bg-sky-500", active: "border-sky-600 bg-sky-600 text-white hover:bg-sky-600" },
  { dot: "bg-violet-500", active: "border-violet-600 bg-violet-600 text-white hover:bg-violet-600" },
  { dot: "bg-amber-500", active: "border-amber-600 bg-amber-600 text-white hover:bg-amber-600" },
  { dot: "bg-emerald-500", active: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600" },
];

export function ScheduleClient({
  branches,
  userId,
  fullName,
}: {
  branches: Branch[];
  userId: string;
  fullName: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [view, setView] = useState<View>("day");
  const [date, setDate] = useState(todayInIsrael());
  const [roomTypeFilter, setRoomTypeFilter] = useState<Room["room_type"][number] | "all">("all");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [availability, setAvailability] = useState<Map<string, AvailabilityInterval[]>>(
    new Map(),
  );
  const [selected, setSelected] = useState<{
    columnKey: string;
    roomId: string;
    roomName: string;
    start: Date;
    end: Date;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRooms(supabase, branchId).then((data) => {
      if (cancelled) return;
      setRooms(data);
      if (!data.find((r) => r.id === selectedRoomId)) {
        setSelectedRoomId(data[0]?.id ?? "");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, supabase]);

  const filteredRooms = useMemo(
    () =>
      roomTypeFilter === "all" ? rooms : rooms.filter((r) => r.room_type.includes(roomTypeFilter)),
    [rooms, roomTypeFilter],
  );

  const monthDates = useMemo(() => monthCalendarDates(date), [date]);

  const { rangeStart, rangeEnd, slots, columns, slotsAnchorDate } = useMemo(() => {
    if (view === "day") {
      const { start, end } = dayBoundaries(date);
      const cols: GridColumn[] = filteredRooms.map((r) => ({ key: r.id, label: r.name }));
      return { rangeStart: start, rangeEnd: end, slots: daySlots(date), columns: cols, slotsAnchorDate: date };
    }
    if (view === "month") {
      const start = dayBoundaries(monthDates[0]).start;
      const end = dayBoundaries(monthDates[41]).end;
      return { rangeStart: start, rangeEnd: end, slots: [] as Slot[], columns: [] as GridColumn[], slotsAnchorDate: date };
    }
    const weekDates = weekDatesStartingSunday(date);
    const start = dayBoundaries(weekDates[0]).start;
    const end = dayBoundaries(weekDates[6]).end;
    const cols: GridColumn[] = weekDates.map((d) => ({
      key: d,
      label: formatInTimeZone(dayBoundaries(d).start, TIMEZONE, "EEEEEE dd/MM", { locale: he }),
    }));
    return {
      rangeStart: start,
      rangeEnd: end,
      slots: daySlots(weekDates[0]),
      columns: cols,
      slotsAnchorDate: weekDates[0],
    };
  }, [view, date, filteredRooms, monthDates]);

  // יום וחודש: כל החדרים המסוננים (צריך זמינות לכולם בו-זמנית). שבוע: חדר
  // אחד בלבד, כי התצוגה היא עמודה לכל יום עבור אותו חדר.
  const roomIdsForQuery = useMemo(
    () => (view === "week" ? [selectedRoomId] : filteredRooms.map((r) => r.id)).filter(Boolean),
    [view, filteredRooms, selectedRoomId],
  );
  const roomIdsKey = useMemo(() => roomIdsForQuery.join(","), [roomIdsForQuery]);

  const reload = useCallback(() => {
    fetchRoomAvailability(supabase, roomIdsForQuery, rangeStart, rangeEnd, userId).then(setAvailability);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, rangeStart, rangeEnd, userId, roomIdsKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Realtime: כל אירוע רלוונטי (חדר מוצג + חופף לטווח המוצג) מרענן את הזמינות.
  useEffect(() => {
    const relevantRoomIds = new Set(roomIdsForQuery);
    const channel = supabase
      .channel("availability-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "availability_events" },
        (payload) => {
          const row = payload.new as { room_id: string; starts_at: string; ends_at: string };
          if (!relevantRoomIds.has(row.room_id)) return;
          if (new Date(row.starts_at) >= rangeEnd || new Date(row.ends_at) <= rangeStart) return;
          reload();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, roomIdsKey, rangeStart, rangeEnd, reload]);

  /** ממיר (columnKey, slot של תבנית היום) ל-instant אמיתי + room_id, לפי התצוגה. */
  function resolveSlot(columnKey: string, slot: Slot): { roomId: string; start: Date; end: Date } {
    if (view === "day") {
      return { roomId: columnKey, start: slot.start, end: slot.end };
    }
    const { start: dayStart } = dayBoundaries(columnKey);
    const offsetMs = slot.start.getTime() - dayBoundaries(slotsAnchorDate).start.getTime();
    const start = new Date(dayStart.getTime() + offsetMs);
    const end = new Date(start.getTime() + (slot.end.getTime() - slot.start.getTime()));
    return { roomId: selectedRoomId, start, end };
  }

  function intervalsFor(columnKey: string, roomId: string) {
    return view === "day"
      ? availability.get(roomId)
      : (availability.get(roomId) ?? []).filter((iv) => {
          const dayStart = dayBoundaries(columnKey).start;
          const dayEnd = dayBoundaries(columnKey).end;
          return iv.startsAt < dayEnd && iv.endsAt > dayStart;
        });
  }

  /**
   * "תפוס" (הזמנה של מטפל/ת אחר/ת) מוצג כ"לא זמין" — מבחינת המטפל/ת אין
   * הבדל מעשי בין השניים, ולא חושפים שקיימת שם הזמנה בכלל. המסך מציג שלושה
   * מצבים בלבד: פנוי · ההזמנה שלי · לא זמין.
   */
  function statusFor(columnKey: string, slot: Slot): SlotStatus {
    const { roomId, start, end } = resolveSlot(columnKey, slot);
    const status = slotStatus(start, end, intervalsFor(columnKey, roomId));
    return status === "taken" ? "blocked" : status;
  }

  /** תווית על ההזמנות שלי בלבד: שם + שעות ההזמנה המלאות. */
  function labelFor(columnKey: string, slot: Slot, status: SlotStatus): string | undefined {
    if (status !== "mine") return undefined;
    const { roomId, start, end } = resolveSlot(columnKey, slot);
    const iv = mineIntervalAt(start, end, intervalsFor(columnKey, roomId));
    if (!iv) return fullName;
    const from = formatInTimeZone(iv.startsAt, TIMEZONE, "HH:mm");
    const to = formatInTimeZone(iv.endsAt, TIMEZONE, "HH:mm");
    return `${fullName} · ${from}–${to}`;
  }

  /** צובע הזמנה "שלי" לפי סוגה (ססיה/כרטיסייה) — לעולם לא על הזמנת מטפל אחר. */
  function colorFor(columnKey: string, slot: Slot, status: SlotStatus): string | undefined {
    if (status !== "mine") return undefined;
    const { roomId, start, end } = resolveSlot(columnKey, slot);
    const source = sourceAt(start, end, intervalsFor(columnKey, roomId));
    if (source === "session") return SESSION_COLOR;
    if (source === "punch_card") return CARD_COLOR;
    return undefined;
  }

  /**
   * לחיצה על משבצת פנויה נוספת באותה עמודה מרחיבה את הבחירה הקיימת (במקום
   * להחליף אותה) — כך אפשר לסמן כמה משבצות ברצף ולהזמין אותן כטווח אחד.
   * מרחיבים רק אם כל המשבצות בטווח המאוחד עדיין פנויות; אחרת מתחילים בחירה חדשה.
   */
  function handleSlotClick(columnKey: string, slot: Slot) {
    const { roomId, start, end } = resolveSlot(columnKey, slot);
    const roomName = rooms.find((r) => r.id === roomId)?.name ?? "";

    if (selected && selected.columnKey === columnKey) {
      const rangeStart = selected.start < start ? selected.start : start;
      const rangeEnd = selected.end > end ? selected.end : end;
      const allFree = slots.every((s) => {
        const resolved = resolveSlot(columnKey, s);
        if (resolved.start < rangeStart || resolved.end > rangeEnd) return true;
        return statusFor(columnKey, s) === "free";
      });
      if (allFree) {
        setSelected({ columnKey, roomId, roomName, start: rangeStart, end: rangeEnd });
        return;
      }
    }
    setSelected({ columnKey, roomId, roomName, start, end });
  }

  /**
   * תצוגה חודשית: לפי חוק ברזל #3 מטפל/ת לא רואה מי הזמין מה — לכן, בניגוד
   * ללוח האדמין, לכל יום מוצגות רק ההזמנות *שלי* (זמן+חדר, כמו ביום/שבוע)
   * ומחוון תפוסה כללי (יחס משבצות פנויות). המחוון לא חושף יותר ממה שתצוגת
   * "יום" כבר חושפת לאותו תאריך בדיוק — רק מסכם אותו לרמת יום.
   */
  const monthDayInfo = useMemo(() => {
    const map = new Map<string, { mine: { room: string; from: string; to: string }[]; free: number; total: number }>();
    if (view !== "month") return map;
    for (const d of monthDates) {
      const { start: dayStart, end: dayEnd } = dayBoundaries(d);
      const daySlotList = daySlots(d);
      let free = 0;
      let total = 0;
      const mine: { room: string; from: string; to: string }[] = [];
      for (const room of filteredRooms) {
        const intervals = availability.get(room.id) ?? [];
        for (const slot of daySlotList) {
          total++;
          if (slotStatus(slot.start, slot.end, intervals) === "free") free++;
        }
        for (const iv of intervals) {
          if (iv.status !== "mine") continue;
          if (iv.startsAt >= dayEnd || iv.endsAt <= dayStart) continue;
          mine.push({
            room: room.name,
            from: formatInTimeZone(iv.startsAt, TIMEZONE, "HH:mm"),
            to: formatInTimeZone(iv.endsAt, TIMEZONE, "HH:mm"),
          });
        }
      }
      map.set(d, { mine, free, total });
    }
    return map;
  }, [view, monthDates, filteredRooms, availability]);

  function goToPrev() {
    setSelected(null);
    if (view === "week") setDate(addDaysToDateStr(date, -7));
    else if (view === "month") setDate(addMonthsToDateStr(date, -1));
    else setDate(addDaysToDateStr(date, -1));
  }
  function goToNext() {
    setSelected(null);
    if (view === "week") setDate(addDaysToDateStr(date, 7));
    else if (view === "month") setDate(addMonthsToDateStr(date, 1));
    else setDate(addDaysToDateStr(date, 1));
  }

  const currentBranchName = branches.find((b) => b.id === branchId)?.name ?? "";
  const dateLabel =
    view === "month"
      ? formatInTimeZone(dayBoundaries(startOfMonth(date)).start, TIMEZONE, "MMMM yyyy", { locale: he })
      : formatInTimeZone(dayBoundaries(date).start, TIMEZONE, "EEEE, dd/MM/yyyy", { locale: he });

  return (
    <div className="flex flex-col gap-4">
      {/* שורות נפרדות, לא שורה אחת עם flex-wrap: קבוצה (למשל חצי הניווט
          והתאריך ביניהם) שנחצית ע"י גלישה נראית שבורה — כל קבוצה נשארת
          יחד בשורה שלה, ורק בין הקבוצות יש גלישה חופשית. */}
      <div className="flex flex-wrap items-center gap-2">
        {branches.map((b, i) => {
          const color = BRANCH_COLORS[i % BRANCH_COLORS.length];
          const active = b.id === branchId;
          return (
            <Button
              key={b.id}
              size="sm"
              variant={active ? "default" : "outline"}
              className={active ? color.active : ""}
              onClick={() => {
                setSelected(null);
                setBranchId(b.id);
              }}
            >
              <span className={cn("ml-1.5 inline-block size-2 rounded-full", color.dot)} />
              {b.name}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={view === "day" ? "default" : "outline"}
          onClick={() => {
            setSelected(null);
            setView("day");
          }}
        >
          יום
        </Button>
        <Button
          size="sm"
          variant={view === "week" ? "default" : "outline"}
          onClick={() => {
            setSelected(null);
            setView("week");
          }}
        >
          שבוע
        </Button>
        <Button
          size="sm"
          variant={view === "month" ? "default" : "outline"}
          onClick={() => {
            setSelected(null);
            setView("month");
          }}
        >
          חודש
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={goToPrev} aria-label="הקודם">
          <ChevronRight className="size-4" />
        </Button>
        <span className="text-sm font-medium">{dateLabel}</span>
        <Button size="sm" variant="outline" onClick={goToNext} aria-label="הבא">
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSelected(null);
            setDate(todayInIsrael());
          }}
        >
          היום
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={roomTypeFilter}
          onChange={(e) => {
            setSelected(null);
            setRoomTypeFilter(e.target.value as Room["room_type"][number] | "all");
          }}
        >
          <option value="all">כל סוגי החדרים</option>
          {Object.entries(ROOM_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {view === "week" && (
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={selectedRoomId}
            onChange={(e) => {
              setSelected(null);
              setSelectedRoomId(e.target.value);
            }}
          >
            {filteredRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {view !== "month" && (
        <>
          <p className="text-sm text-muted-foreground">
            לחצו על משבצת <span className="font-medium text-foreground">פנויה</span> כדי לקבוע תור. אפשר
            ללחוץ על עוד משבצות פנויות באותה עמודה כדי להאריך את ההזמנה.
          </p>
          <Legend statuses={["free", "mine", "blocked"]} />

          <AvailabilityGrid
            columns={columns}
            slots={slots}
            // h-6 ולא ברירת המחדל h-5: מאז שיש תווית (שם + שעות) על ההזמנות שלי,
            // השורה צריכה גובה שהטקסט נכנס בו.
            rowHeightClass="h-6"
            statusFor={statusFor}
            colorFor={colorFor}
            labelFor={labelFor}
            titleFor={labelFor}
            onSlotClick={handleSlotClick}
            isSelected={(columnKey, slot) => {
              if (!selected || selected.columnKey !== columnKey) return false;
              const { start, end } = resolveSlot(columnKey, slot);
              return start >= selected.start && end <= selected.end;
            }}
          />
        </>
      )}

      {view === "month" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            לחצו על יום כדי לעבור לתצוגה היומית שלו ולקבוע תור.
          </p>
          <div className="grid grid-cols-7 overflow-hidden rounded-md border text-center text-xs font-medium">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="border-b border-l bg-muted/50 p-2 last:border-l-0">
                {label}
              </div>
            ))}
            {monthDates.map((d) => {
              const inCurrentMonth = d.slice(0, 7) === startOfMonth(date).slice(0, 7);
              const isToday = d === todayInIsrael();
              const info = monthDayInfo.get(d);
              const freeRatio = info && info.total > 0 ? info.free / info.total : 1;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setDate(d);
                    setView("day");
                  }}
                  className={cn(
                    "flex min-h-24 w-full flex-col items-stretch gap-0.5 border-b border-l p-1.5 text-right last:border-l-0 hover:bg-muted/40",
                    !inCurrentMonth && "bg-muted/20 text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "self-start text-xs",
                      isToday && "rounded-full bg-primary px-1.5 text-primary-foreground",
                    )}
                  >
                    {formatInTimeZone(dayBoundaries(d).start, TIMEZONE, "d")}
                  </span>

                  {info && info.mine.slice(0, 2).map((m, i) => (
                    <span
                      key={i}
                      className="truncate rounded-sm bg-primary/10 px-1 text-[11px] leading-tight text-foreground"
                      title={`${m.from}–${m.to} · ${m.room}`}
                    >
                      {m.from}–{m.to} · {m.room}
                    </span>
                  ))}
                  {info && info.mine.length > 2 && (
                    <span className="px-1 text-[11px] text-muted-foreground">
                      +{info.mine.length - 2} נוספות
                    </span>
                  )}

                  {inCurrentMonth && info && info.total > 0 && (
                    <span
                      className={cn(
                        "mt-auto self-start text-[11px]",
                        freeRatio > 0.5
                          ? "text-emerald-600 dark:text-emerald-400"
                          : freeRatio > 0.15
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-destructive",
                      )}
                    >
                      {info.free} פנויות
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        // pointer-events-none על העטיפה כדי שלחיצות על שאר הלוח (מחוץ למגירה)
        // ימשיכו להגיע למשבצות — כך אפשר להמשיך ולהרחיב את הבחירה בזמן
        // שהמגירה פתוחה, ולא רק לבטל אותה. בלי backdrop בכוונה — זו ההתנהגות
        // הקיימת (לא מודל חוסם), רק שהמיקום עבר לצד (מגירה, לפי §7.3
        // במסמך השפה העיצובית) במקום כרטיס שצף למטה.
        <div className="pointer-events-none fixed inset-y-0 start-0 z-50 flex items-stretch p-4">
          <div className="pointer-events-auto w-full max-w-[480px] overflow-y-auto rounded-modal bg-surface shadow-e3">
            <SlotPreview
              roomId={selected.roomId}
              roomName={selected.roomName}
              branchName={currentBranchName}
              start={selected.start}
              end={selected.end}
              onClose={() => setSelected(null)}
              onBooked={() => {
                setSelected(null);
                reload();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SlotPreview({
  roomId,
  roomName,
  branchName,
  start,
  end,
  onClose,
  onBooked,
}: {
  roomId: string;
  roomName: string;
  branchName: string;
  start: Date;
  end: Date;
  onClose: () => void;
  onBooked: () => void;
}) {
  const { accessStart, accessEnd } = accessWindow(start, end);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ hoursRemaining: number } | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const result = await bookSlot(roomId, start.toISOString(), end.toISOString());
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConfirmed({ hoursRemaining: result.hoursRemaining });
  }

  const hours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);

  return (
    <div className="flex flex-col text-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="text-lg font-semibold text-foreground">אישור הזמנה</p>
          <p className="text-[13px] text-text-muted">
            {branchName ? `${branchName} · ` : ""}
            {roomName} · {formatInTimeZone(start, TIMEZONE, "EEEE, dd/MM/yyyy", { locale: he })}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex size-8 shrink-0 items-center justify-center rounded-button text-text-muted hover:bg-subtle hover:text-foreground"
          aria-label="סגירה"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-3 px-5 py-4">
        <p dir="ltr" className="tabular-nums text-right text-base font-medium text-foreground">
          {formatInTimeZone(start, TIMEZONE, "HH:mm")}–{formatInTimeZone(end, TIMEZONE, "HH:mm")}
        </p>
        <p className="text-xs text-text-muted">אפשר עדיין ללחוץ על משבצות פנויות נוספות כדי להאריך.</p>
        <p className="text-text-secondary">
          🔑 כניסה בפועל:{" "}
          <span dir="ltr" className="tabular-nums">
            {formatInTimeZone(accessStart, TIMEZONE, "HH:mm")}
          </span>{" "}
          · פינוי:{" "}
          <span dir="ltr" className="tabular-nums">
            {formatInTimeZone(accessEnd, TIMEZONE, "HH:mm")}
          </span>
        </p>

        {/* סיכום לפני האישור — לפי §7.3 במסמך השפה העיצובית: כל טופס
            מסתיים בסיכום מה יקרה בפועל, לפני כפתור האישור. */}
        <div className="flex items-center justify-between rounded-field bg-canvas px-4 py-3 text-[14.5px] font-semibold text-foreground">
          <span>סה״כ</span>
          <span className="tabular-nums">{hours} שעות</span>
        </div>
      </div>

      {confirmed ? (
        <div className="flex flex-col gap-3 px-5 pb-5">
          <p className="text-success-fg">ההזמנה אושרה! יתרה לאחר ההזמנה: {confirmed.hoursRemaining} שעות.</p>
          <Button onClick={onBooked}>סגירה</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-5 pb-5">
          {error && <p className="text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleConfirm} disabled={loading}>
              {loading ? "מזמין..." : "אישור הזמנה"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              ביטול
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
