"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { he } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Plus, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { TIMEZONE, formatTimeHe } from "@/lib/time";
import {
  dayBoundaries,
  daySlots,
  todayInIsrael,
  addDaysToDateStr,
  addMonthsToDateStr,
  weekDatesStartingSunday,
  monthCalendarDates,
  startOfMonth,
  type Slot,
} from "@/lib/availability/grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { WEEKDAY_LABELS, slotHours } from "@/lib/pricing/session";
import type { Database } from "@/lib/supabase/types";
import type { SlotStatus } from "@/lib/availability/types";
import {
  AvailabilityGrid,
  Legend,
  SESSION_COLOR,
  CARD_COLOR,
  type GridColumn,
} from "@/app/(app)/schedule/availability-grid";
import {
  adminCancelBookingAction,
  adminCreateBookingAction,
  adminCreateRecurringBookingAction,
  createRoomBlockAction,
  deleteRoomBlockAction,
} from "./actions";
import { adminCreateSessionAction } from "../sessions/actions";

type Branch = Database["public"]["Tables"]["branches"]["Row"];
type Room = Database["public"]["Tables"]["rooms"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type RoomBlock = Database["public"]["Tables"]["room_blocks"]["Row"];
type Therapist = { id: string; full_name: string; phone: string };

const SOURCE_LABELS: Record<Booking["source"], string> = {
  punch_card: "כרטיסייה",
  session: "ססיה",
  admin_comp: "שיבוץ אדמין",
};

interface SlotDialogState {
  date: string;
  startTime: string;
  endTime: string;
  roomId?: string; // undefined = תצוגה חודשית, אין חדר קבוע — האדמין בוחר
}

export function BoardClient({
  branches,
  therapists,
  baseHours,
  basePrice,
}: {
  branches: Branch[];
  therapists: Therapist[];
  baseHours: number;
  basePrice: number;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [date, setDate] = useState(todayInIsrael());
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blocks, setBlocks] = useState<RoomBlock[]>([]);
  const [formForRoom, setFormForRoom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid" | "week" | "month">("list");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [slotDialog, setSlotDialog] = useState<SlotDialogState | null>(null);

  function openSlotDialog(state: SlotDialogState) {
    setError(null);
    setSlotDialog(state);
  }

  useEffect(() => {
    supabase
      .from("rooms")
      .select("*")
      .eq("branch_id", branchId)
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => {
        setRooms(data ?? []);
        if (!data?.find((r) => r.id === selectedRoomId)) {
          setSelectedRoomId(data?.[0]?.id ?? "");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, branchId]);

  const roomIds = useMemo(() => rooms.map((r) => r.id), [rooms]);
  const weekDates = useMemo(() => weekDatesStartingSunday(date), [date]);
  const monthDates = useMemo(() => monthCalendarDates(date), [date]);

  // טווח השאילתה תלוי בתצוגה: יום בודד ל"רשימה"/"לוח זמנים", שבוע/חודש
  // מלא ל"שבועי"/"חודשי" (כולל ריפוד החודש הקודם/הבא בתצוגה החודשית).
  const { start, end } = useMemo(() => {
    if (viewMode === "week") {
      return { start: dayBoundaries(weekDates[0]).start, end: dayBoundaries(weekDates[6]).end };
    }
    if (viewMode === "month") {
      return { start: dayBoundaries(monthDates[0]).start, end: dayBoundaries(monthDates[41]).end };
    }
    return dayBoundaries(date);
  }, [viewMode, date, weekDates, monthDates]);
  const roomIdsKey = roomIds.join(",");

  const reload = useCallback(() => {
    const bookingsQuery = roomIds.length
      ? supabase
          .from("bookings")
          .select("*")
          .in("room_id", roomIds)
          .eq("status", "confirmed")
          .lt("starts_at", end.toISOString())
          .gt("ends_at", start.toISOString())
      : Promise.resolve({ data: [] as Booking[] });
    const blocksQuery = roomIds.length
      ? supabase
          .from("room_blocks")
          .select("*")
          .in("room_id", roomIds)
          .lt("starts_at", end.toISOString())
          .gt("ends_at", start.toISOString())
      : Promise.resolve({ data: [] as RoomBlock[] });

    Promise.all([bookingsQuery, blocksQuery]).then(([{ data: b }, { data: rb }]) => {
      setBookings(b ?? []);
      setBlocks(rb ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, roomIdsKey, start, end]);

  useEffect(() => {
    reload();
  }, [reload]);

  const therapistById = useMemo(() => new Map(therapists.map((t) => [t.id, t])), [therapists]);

  const gridColumns: GridColumn[] = useMemo(
    () => rooms.map((r) => ({ key: r.id, label: r.name })),
    [rooms],
  );
  const gridSlots = useMemo(() => daySlots(date), [date]);

  function bookingAt(roomId: string, slot: Slot) {
    return bookings.find(
      (b) => b.room_id === roomId && new Date(b.starts_at) < slot.end && new Date(b.ends_at) > slot.start,
    );
  }
  function blockAt(roomId: string, slot: Slot) {
    return blocks.find(
      (rb) => rb.room_id === roomId && new Date(rb.starts_at) < slot.end && new Date(rb.ends_at) > slot.start,
    );
  }

  function gridStatusFor(roomId: string, slot: Slot): SlotStatus {
    if (blockAt(roomId, slot)) return "blocked";
    return bookingAt(roomId, slot) ? "taken" : "free";
  }

  function gridTitleFor(roomId: string, slot: Slot, status: SlotStatus): string | undefined {
    if (status === "taken") {
      const b = bookingAt(roomId, slot);
      if (!b) return undefined;
      return `${therapistById.get(b.user_id)?.full_name ?? "מטפל/ת"} · ${SOURCE_LABELS[b.source]} · ${formatInTimeZone(new Date(b.starts_at), TIMEZONE, "HH:mm")}–${formatInTimeZone(new Date(b.ends_at), TIMEZONE, "HH:mm")}`;
    }
    if (status === "blocked") {
      const rb = blockAt(roomId, slot);
      return rb ? `חסום: ${rb.reason}` : undefined;
    }
    return undefined;
  }

  function gridLabelFor(roomId: string, slot: Slot, status: SlotStatus): string | undefined {
    if (status === "taken") {
      const b = bookingAt(roomId, slot);
      if (!b) return undefined;
      return `${therapistById.get(b.user_id)?.full_name ?? "מטפל/ת"} · ${SOURCE_LABELS[b.source]}`;
    }
    if (status === "blocked") {
      const rb = blockAt(roomId, slot);
      return rb ? `חסום: ${rb.reason}` : undefined;
    }
    return undefined;
  }

  function gridColorFor(roomId: string, slot: Slot, status: SlotStatus): string | undefined {
    if (status !== "taken") return undefined;
    const b = bookingAt(roomId, slot);
    if (b?.source === "session") return SESSION_COLOR;
    if (b?.source === "punch_card") return CARD_COLOR;
    return undefined;
  }

  // ═══ תצוגה שבועית: חדר נבחר אחד, 7 ימים כעמודות (כמו לוח הזמנים של המטפל) ═══
  const weekColumns: GridColumn[] = useMemo(
    () =>
      weekDates.map((d) => ({
        key: d,
        label: formatInTimeZone(dayBoundaries(d).start, TIMEZONE, "EEEEEE dd/MM", { locale: he }),
      })),
    [weekDates],
  );
  const weekSlots = useMemo(() => daySlots(weekDates[0]), [weekDates]);

  function resolveWeekSlot(columnKey: string, slot: Slot): Slot {
    const { start: dayStart } = dayBoundaries(columnKey);
    const offsetMs = slot.start.getTime() - dayBoundaries(weekDates[0]).start.getTime();
    const start = new Date(dayStart.getTime() + offsetMs);
    const end = new Date(start.getTime() + (slot.end.getTime() - slot.start.getTime()));
    return { start, end };
  }

  // ═══ תצוגה חודשית: כל מה שקורה באותו יום בסניף — הזמנות *וחסימות* יחד,
  // ממוינות לפי שעת התחלה, כל אחת עם שעה · מי/מה · סוג · חדר. לחיצה עוברת
  // ל"רשימה" של אותו יום לפירוט מלא.
  //
  // חסימה מוצגת עם ה-reason שלה (למשל שם המטפל/ת מייבוא Skedda) — "חסימה"
  // בלי הסבר לא אומר לאדמין כלום. שמות מוצגים כאן כי זה לוח האדמין: חוק
  // ברזל #3 חל על מה שמטפל/ת רואה (public_availability), לא על האדמין. ═══
  const MONTH_PREVIEW_LIMIT = 3;

  type MonthEntry = { time: string; what: string; kind: "booking" | "block"; room: string };

  const monthEntriesByDate = useMemo(() => {
    const roomNameById = new Map(rooms.map((r) => [r.id, r.name]));
    const map = new Map<string, MonthEntry[]>();
    for (const d of monthDates) {
      const { start: dayStart, end: dayEnd } = dayBoundaries(d);
      const overlapsDay = (from: string, to: string) =>
        new Date(from) < dayEnd && new Date(to) > dayStart;

      const entries: (MonthEntry & { sort: string })[] = [];

      for (const b of bookings) {
        if (!overlapsDay(b.starts_at, b.ends_at)) continue;
        entries.push({
          sort: b.starts_at,
          time: formatTimeHe(new Date(b.starts_at)),
          what: `${therapistById.get(b.user_id)?.full_name ?? "מטפל/ת"} · ${SOURCE_LABELS[b.source]}`,
          kind: "booking",
          room: roomNameById.get(b.room_id) ?? "",
        });
      }
      for (const rb of blocks) {
        if (!overlapsDay(rb.starts_at, rb.ends_at)) continue;
        entries.push({
          sort: rb.starts_at,
          time: formatTimeHe(new Date(rb.starts_at)),
          what: `חסימה · ${rb.reason}`,
          kind: "block",
          room: roomNameById.get(rb.room_id) ?? "",
        });
      }

      if (entries.length > 0) {
        entries.sort((a, b) => a.sort.localeCompare(b.sort));
        map.set(
          d,
          entries.map((e) => ({ time: e.time, what: e.what, kind: e.kind, room: e.room })),
        );
      }
    }
    return map;
  }, [monthDates, bookings, blocks, therapistById, rooms]);

  function goToPrev() {
    if (viewMode === "week") setDate(addDaysToDateStr(date, -7));
    else if (viewMode === "month") setDate(addMonthsToDateStr(date, -1));
    else setDate(addDaysToDateStr(date, -1));
  }
  function goToNext() {
    if (viewMode === "week") setDate(addDaysToDateStr(date, 7));
    else if (viewMode === "month") setDate(addMonthsToDateStr(date, 1));
    else setDate(addDaysToDateStr(date, 1));
  }

  const dateLabel =
    viewMode === "week"
      ? `${formatInTimeZone(dayBoundaries(weekDates[0]).start, TIMEZONE, "dd/MM")} – ${formatInTimeZone(dayBoundaries(weekDates[6]).start, TIMEZONE, "dd/MM/yyyy")}`
      : viewMode === "month"
        ? formatInTimeZone(dayBoundaries(startOfMonth(date)).start, TIMEZONE, "MMMM yyyy", { locale: he })
        : formatInTimeZone(start, TIMEZONE, "EEEE, dd/MM/yyyy", { locale: he });

  return (
    <div className="flex flex-col gap-4">
      {/* שלוש שורות נפרדות, לא שורה אחת עם flex-wrap: קבוצה (למשל חצי הניווט
          והתאריך ביניהם) שנחצית ע"י גלישה נראית שבורה — כל קבוצה נשארת
          יחד בשורה שלה, ורק בין הקבוצות יש גלישה חופשית. */}
      <div className="flex flex-wrap items-center gap-2">
        {branches.map((b) => (
          <Button key={b.id} size="sm" variant={b.id === branchId ? "default" : "outline"} onClick={() => setBranchId(b.id)}>
            {b.name}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={goToPrev} aria-label="הקודם">
          <ChevronRight className="size-4" />
        </Button>
        <span className="text-sm font-medium">{dateLabel}</span>
        <Button size="sm" variant="outline" onClick={goToNext} aria-label="הבא">
          <ChevronLeft className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDate(todayInIsrael())}>
          היום
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={viewMode === "list" ? "default" : "outline"} onClick={() => setViewMode("list")}>
          רשימה
        </Button>
        <Button size="sm" variant={viewMode === "grid" ? "default" : "outline"} onClick={() => setViewMode("grid")}>
          לוח זמנים
        </Button>
        <Button size="sm" variant={viewMode === "week" ? "default" : "outline"} onClick={() => setViewMode("week")}>
          שבועי
        </Button>
        <Button size="sm" variant={viewMode === "month" ? "default" : "outline"} onClick={() => setViewMode("month")}>
          חודשי
        </Button>
        {viewMode === "week" && (
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={selectedRoomId}
            onChange={(e) => setSelectedRoomId(e.target.value)}
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {viewMode === "grid" && (
        <div className="flex flex-col gap-3">
          <Legend />
          <p className="text-xs text-muted-foreground">רחפו מעל משבצת תפוסה כדי לראות את כל הפרטים.</p>
          <AvailabilityGrid
            columns={gridColumns}
            slots={gridSlots}
            rowHeightClass="h-6"
            statusFor={(columnKey, slot) => gridStatusFor(columnKey, slot)}
            titleFor={(columnKey, slot, status) => gridTitleFor(columnKey, slot, status)}
            labelFor={(columnKey, slot, status) => gridLabelFor(columnKey, slot, status)}
            colorFor={(columnKey, slot, status) => gridColorFor(columnKey, slot, status)}
          />
        </div>
      )}

      {viewMode === "week" && (
        <div className="flex flex-col gap-3">
          <Legend />
          {selectedRoomId ? (
            <>
              <p className="text-xs text-muted-foreground">
                לחיצה על משבצת פנויה פותחת שיבוץ. רחפו מעל משבצת תפוסה כדי לראות את כל הפרטים.
              </p>
              <AvailabilityGrid
                columns={weekColumns}
                slots={weekSlots}
                rowHeightClass="h-6"
                statusFor={(columnKey, slot) => gridStatusFor(selectedRoomId, resolveWeekSlot(columnKey, slot))}
                titleFor={(columnKey, slot, status) =>
                  gridTitleFor(selectedRoomId, resolveWeekSlot(columnKey, slot), status)
                }
                labelFor={(columnKey, slot, status) =>
                  gridLabelFor(selectedRoomId, resolveWeekSlot(columnKey, slot), status)
                }
                colorFor={(columnKey, slot, status) =>
                  gridColorFor(selectedRoomId, resolveWeekSlot(columnKey, slot), status)
                }
                onSlotClick={(columnKey, slot) => {
                  const resolved = resolveWeekSlot(columnKey, slot);
                  openSlotDialog({
                    roomId: selectedRoomId,
                    date: columnKey,
                    startTime: formatInTimeZone(resolved.start, TIMEZONE, "HH:mm"),
                    endTime: formatInTimeZone(resolved.end, TIMEZONE, "HH:mm"),
                  });
                }}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">אין חדרים פעילים בסניף זה.</p>
          )}
        </div>
      )}

      {viewMode === "month" && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-7 overflow-hidden rounded-md border text-center text-xs font-medium">
            {["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"].map((label) => (
              <div key={label} className="border-b border-l bg-muted/50 p-2 last:border-l-0">
                {label}
              </div>
            ))}
            {monthDates.map((d) => {
              const inCurrentMonth = d.slice(0, 7) === startOfMonth(date).slice(0, 7);
              const isToday = d === todayInIsrael();
              const isPast = d < todayInIsrael();
              const dayEntries = monthEntriesByDate.get(d) ?? [];
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDate(d);
                    setViewMode("list");
                  }}
                  className={cn(
                    "group relative flex min-h-32 w-full flex-col items-stretch gap-0.5 border-b border-l p-1.5 text-right last:border-l-0 hover:bg-muted/40",
                    !inCurrentMonth && "bg-muted/20 text-muted-foreground",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "self-start text-xs",
                        isToday && "rounded-full bg-primary px-1.5 text-primary-foreground",
                      )}
                    >
                      {formatInTimeZone(dayBoundaries(d).start, TIMEZONE, "d")}
                    </span>
                    {!isPast && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="שיבוץ ביום זה"
                        title="שיבוץ ביום זה"
                        onClick={(e) => {
                          e.stopPropagation();
                          openSlotDialog({ date: d, startTime: "09:00", endTime: "10:00" });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            openSlotDialog({ date: d, startTime: "09:00", endTime: "10:00" });
                          }
                        }}
                        className="rounded-sm p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Plus className="size-3.5" />
                      </span>
                    )}
                  </div>

                  {dayEntries.slice(0, MONTH_PREVIEW_LIMIT).map((entry, i) => (
                    <span
                      key={i}
                      className={cn(
                        "flex items-baseline gap-1 truncate rounded-sm px-1 text-[11px] leading-tight",
                        entry.kind === "block"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-primary/10 text-foreground",
                      )}
                      title={`${entry.time} · ${entry.what}${entry.room ? ` · ${entry.room}` : ""}`}
                    >
                      <span className="shrink-0 tabular-nums font-medium">{entry.time}</span>
                      <span className="truncate">
                        {entry.what}
                        {entry.room ? ` · ${entry.room}` : ""}
                      </span>
                    </span>
                  ))}

                  {dayEntries.length > MONTH_PREVIEW_LIMIT && (
                    <span className="px-1 text-[11px] text-muted-foreground">
                      +{dayEntries.length - MONTH_PREVIEW_LIMIT} נוספים
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === "list" && (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rooms.map((room) => {
          const roomBookings = bookings
            .filter((b) => b.room_id === room.id)
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          const roomBlocks = blocks.filter((b) => b.room_id === room.id);

          return (
            <Card key={room.id}>
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{room.name}</p>
                  <Button size="sm" variant="outline" onClick={() => setFormForRoom(formForRoom === room.id ? null : room.id)}>
                    {formForRoom === room.id ? "סגירה" : "+ פעולה"}
                  </Button>
                </div>

                {roomBookings.length === 0 && roomBlocks.length === 0 && (
                  <p className="text-sm text-muted-foreground">אין הזמנות ביום זה.</p>
                )}

                {roomBookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>
                      <span dir="ltr">
                        {formatInTimeZone(new Date(b.starts_at), TIMEZONE, "HH:mm")}–
                        {formatInTimeZone(new Date(b.ends_at), TIMEZONE, "HH:mm")}
                      </span>{" "}
                      · {therapistById.get(b.user_id)?.full_name ?? "מטפל/ת"} · {SOURCE_LABELS[b.source]}
                    </span>
                    <CancelBookingButton bookingId={b.id} onDone={reload} />
                  </div>
                ))}

                {roomBlocks.map((rb) => (
                  <div key={rb.id} className="flex items-center justify-between rounded-md border border-dashed p-2 text-sm">
                    <span>
                      <span dir="ltr">
                        {formatInTimeZone(new Date(rb.starts_at), TIMEZONE, "HH:mm")}–
                        {formatInTimeZone(new Date(rb.ends_at), TIMEZONE, "HH:mm")}
                      </span>{" "}
                      · חסום: {rb.reason}
                    </span>
                    <RemoveBlockButton blockId={rb.id} onDone={reload} />
                  </div>
                ))}

                {formForRoom === room.id && (
                  <SlotActionPanel
                    roomId={room.id}
                    rooms={rooms}
                    date={date}
                    therapists={therapists}
                    baseHours={baseHours}
                    basePrice={basePrice}
                    onDone={() => {
                      setFormForRoom(null);
                      reload();
                      router.refresh();
                    }}
                    onRefresh={() => {
                      reload();
                      router.refresh();
                    }}
                    onError={setError}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      )}

      {slotDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSlotDialog(null)}
        >
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  שיבוץ · {formatInTimeZone(dayBoundaries(slotDialog.date).start, TIMEZONE, "EEEE, dd/MM/yyyy", { locale: he })}
                </p>
                <button
                  onClick={() => setSlotDialog(null)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="סגירה"
                >
                  <X className="size-4" />
                </button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <SlotActionPanel
                roomId={slotDialog.roomId}
                rooms={rooms}
                date={slotDialog.date}
                initialStart={slotDialog.startTime}
                initialEnd={slotDialog.endTime}
                therapists={therapists}
                baseHours={baseHours}
                basePrice={basePrice}
                onDone={() => {
                  setSlotDialog(null);
                  reload();
                  router.refresh();
                }}
                onRefresh={() => {
                  reload();
                  router.refresh();
                }}
                onError={setError}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function CancelBookingButton({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  async function handleCancel() {
    const refund = window.confirm("להחזיר שעות ליתרת המטפל/ת? (אישור = כן, ביטול = לא)");
    setLoading(true);
    await adminCancelBookingAction(bookingId, refund);
    setLoading(false);
    onDone();
  }
  return (
    <Button size="sm" variant="ghost" onClick={handleCancel} disabled={loading}>
      ביטול
    </Button>
  );
}

function RemoveBlockButton({ blockId, onDone }: { blockId: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  async function handleRemove() {
    setLoading(true);
    await deleteRoomBlockAction(blockId);
    setLoading(false);
    onDone();
  }
  return (
    <Button size="sm" variant="ghost" onClick={handleRemove} disabled={loading}>
      הסרה
    </Button>
  );
}

type ActionMode = "booking" | "session" | "recurring" | "block";

const MODE_LABELS: Record<ActionMode, string> = {
  booking: "שיבוץ מטפל/ת",
  session: "ססיה אמיתית",
  recurring: "חזרה חודשית קלה",
  block: "חסימת תחזוקה",
};

function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/**
 * פאנל פעולה משותף — יצירת הזמנה/ססיה/חזרה חודשית/חסימה. משמש גם מוטמע
 * בכרטיס חדר (תצוגת רשימה, roomId קבוע) וגם בתוך חלונית צפה (שבועי/חודשי,
 * roomId עשוי להיות ריק בתצוגה חודשית — כי היא לא לפי חדר — ואז מוצג בורר חדר).
 */
function SlotActionPanel({
  roomId,
  rooms,
  date,
  initialStart = "09:00",
  initialEnd = "10:00",
  therapists,
  baseHours,
  basePrice,
  onDone,
  onRefresh,
  onError,
}: {
  roomId?: string;
  rooms: Room[];
  date: string;
  initialStart?: string;
  initialEnd?: string;
  therapists: Therapist[];
  baseHours: number;
  basePrice: number;
  onDone: () => void;
  /** רענון נתונים בלי לסגור את הפאנל — למשל אחרי חזרה חודשית עם הצלחה חלקית. */
  onRefresh: () => void;
  onError: (error: string | null) => void;
}) {
  const [mode, setMode] = useState<ActionMode>("booking");
  const [selectedRoomId, setSelectedRoomId] = useState(roomId ?? rooms[0]?.id ?? "");
  const [therapistQuery, setTherapistQuery] = useState("");
  const [selectedTherapistId, setSelectedTherapistId] = useState("");
  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(initialEnd);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const targetRoomId = roomId ?? selectedRoomId;
  const weekday = weekdayOf(date);
  const pickedHours = slotHours({ startTime, endTime });

  const filteredTherapists = therapists
    .filter((t) => t.full_name.includes(therapistQuery) || t.phone.includes(therapistQuery))
    .slice(0, 8);

  async function handleSubmit() {
    onError(null);
    setResult(null);

    if (!targetRoomId) {
      onError("יש לבחור חדר");
      return;
    }
    if (endTime <= startTime) {
      onError("שעת הסיום חייבת להיות אחרי שעת ההתחלה");
      return;
    }
    if ((mode === "booking" || mode === "session" || mode === "recurring") && !selectedTherapistId) {
      onError("יש לבחור מטפל/ת");
      return;
    }
    if (mode === "session" && pickedHours !== baseHours) {
      onError(`ססיה אמיתית חייבת בדיוק ${baseHours} שעות שבועיות — טווח השעות הנוכחי הוא ${pickedHours}.`);
      return;
    }

    setLoading(true);

    if (mode === "session") {
      const res = await adminCreateSessionAction(
        selectedTherapistId,
        [{ roomId: targetRoomId, weekday, startTime, endTime }],
        date,
      );
      setLoading(false);
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onDone();
      return;
    }

    if (mode === "recurring") {
      const res = await adminCreateRecurringBookingAction(selectedTherapistId, targetRoomId, date, startTime, endTime, note);
      setLoading(false);
      if (!res.ok) {
        onError(res.error);
        return;
      }
      if (res.skipped.length === 0) {
        onDone();
        return;
      }
      // חלק מההופעות נכשלו (למשל התנגשות אמיתית) — לא מבטלים את מה שכבר
      // נוצר, רק מציגים סיכום לאדמין במקום לסגור את הפאנל בשקט. עדיין
      // מרעננים את הלוח כדי שההזמנות שכן נוצרו יופיעו מיד.
      onRefresh();
      setResult(
        `נוצרו ${res.created} הזמנות. לא נוצרו: ${res.skipped.map((s) => `${s.date} (${s.error})`).join(", ")}`,
      );
      return;
    }

    const { start } = dayBoundaries(date);
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const startsAt = new Date(start.getTime() + (sh * 60 + sm) * 60_000).toISOString();
    const endsAt = new Date(start.getTime() + (eh * 60 + em) * 60_000).toISOString();

    const res =
      mode === "booking"
        ? await adminCreateBookingAction(selectedTherapistId, targetRoomId, startsAt, endsAt, note)
        : await createRoomBlockAction(targetRoomId, startsAt, endsAt, note || "תחזוקה");
    setLoading(false);

    if (!res.ok) {
      onError(res.error);
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(MODE_LABELS) as ActionMode[]).map((m) => (
          <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
            {MODE_LABELS[m]}
          </Button>
        ))}
      </div>

      {!roomId && (
        <div className="flex flex-col gap-1">
          <Label>חדר</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={selectedRoomId}
            onChange={(e) => setSelectedRoomId(e.target.value)}
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {(mode === "booking" || mode === "session" || mode === "recurring") && (
        <div className="flex flex-col gap-1">
          <Input
            placeholder="חיפוש מטפל/ת (שם או טלפון)"
            value={therapistQuery}
            onChange={(e) => {
              setTherapistQuery(e.target.value);
              setSelectedTherapistId("");
            }}
          />
          {therapistQuery && !selectedTherapistId && (
            <ul className="max-h-32 overflow-y-auto rounded-md border text-sm">
              {filteredTherapists.map((t) => (
                <li
                  key={t.id}
                  className="cursor-pointer p-1.5 hover:bg-muted"
                  onClick={() => {
                    setSelectedTherapistId(t.id);
                    setTherapistQuery(t.full_name);
                  }}
                >
                  {t.full_name} · {t.phone}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Input type="time" step={1800} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        <Input type="time" step={1800} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
      </div>

      {mode === "session" && (
        <p className="text-xs text-muted-foreground">
          {WEEKDAY_LABELS[weekday]}, {pickedHours} שעות שבועיות מתוך {baseHours} נדרשות · {formatCurrency(basePrice)}
          /חודש. יוצר מנוי ססיה אמיתי — נשלח קישור תשלום למייל, בלי בדיקת התנגשות.
        </p>
      )}
      {mode === "recurring" && (
        <p className="text-xs text-muted-foreground">
          יוצר הזמנת {WEEKDAY_LABELS[weekday]} רגילה מ-{date} ואילך, כל שבוע, עד סוף החודש. בלי תשלום, בלי הגבלת שעות —
          כל הופעה נבדקת בנפרד.
        </p>
      )}

      {mode !== "session" && (
        <Input placeholder="הערה" value={note} onChange={(e) => setNote(e.target.value)} />
      )}

      {result && <p className="text-sm text-muted-foreground">{result}</p>}

      <Button size="sm" onClick={handleSubmit} disabled={loading}>
        {loading ? "שומר..." : "שמירה"}
      </Button>
    </div>
  );
}
