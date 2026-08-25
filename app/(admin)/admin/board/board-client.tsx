"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { he } from "date-fns/locale";

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
import { Card, CardContent } from "@/components/ui/card";
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
  createRoomBlockAction,
  deleteRoomBlockAction,
} from "./actions";

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

export function BoardClient({ branches, therapists }: { branches: Branch[]; therapists: Therapist[] }) {
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

  // ═══ תצוגה חודשית: שעה + שם מטפל/ת לכל הזמנה באותו יום (כל החדרים בסניף),
  // ממוינות לפי שעת התחלה. לחיצה עוברת ל"רשימה" של אותו יום לפירוט מלא.
  // חסימות תחזוקה נספרות בנפרד — יום שסגור לתחזוקה חייב להיראות שונה מיום
  // עמוס. שמות מוצגים כאן כי זה לוח האדמין (חוק ברזל #3 חל על מה שמטפל/ת
  // רואה, לא על האדמין). ═══
  const MONTH_PREVIEW_LIMIT = 3;

  const monthEntriesByDate = useMemo(() => {
    const map = new Map<string, { entries: { time: string; name: string }[]; blocks: number }>();
    for (const d of monthDates) {
      const { start: dayStart, end: dayEnd } = dayBoundaries(d);
      const overlapsDay = (from: string, to: string) =>
        new Date(from) < dayEnd && new Date(to) > dayStart;

      const entries = bookings
        .filter((b) => overlapsDay(b.starts_at, b.ends_at))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map((b) => ({
          time: formatTimeHe(new Date(b.starts_at)),
          name: therapistById.get(b.user_id)?.full_name ?? "—",
        }));
      const blockCount = blocks.filter((b) => overlapsDay(b.starts_at, b.ends_at)).length;

      if (entries.length > 0 || blockCount > 0) {
        map.set(d, { entries, blocks: blockCount });
      }
    }
    return map;
  }, [monthDates, bookings, blocks, therapistById]);

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
      <div className="flex flex-wrap items-center gap-2">
        {branches.map((b) => (
          <Button key={b.id} size="sm" variant={b.id === branchId ? "default" : "outline"} onClick={() => setBranchId(b.id)}>
            {b.name}
          </Button>
        ))}
        <div className="mx-2 h-6 w-px bg-border" />
        <Button size="sm" variant="outline" onClick={goToPrev}>
          הקודם
        </Button>
        <span className="text-sm font-medium">{dateLabel}</span>
        <Button size="sm" variant="outline" onClick={goToNext}>
          הבא
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDate(todayInIsrael())}>
          היום
        </Button>
        <div className="mx-2 h-6 w-px bg-border" />
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
              <p className="text-xs text-muted-foreground">רחפו מעל משבצת תפוסה כדי לראות את כל הפרטים.</p>
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
              const day = monthEntriesByDate.get(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDate(d);
                    setViewMode("list");
                  }}
                  className={cn(
                    "flex min-h-28 w-full flex-col items-stretch gap-0.5 border-b border-l p-1.5 text-right last:border-l-0 hover:bg-muted/40",
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

                  {day?.blocks ? (
                    <span className="truncate rounded-sm bg-destructive/15 px-1 text-[11px] text-destructive">
                      {day.blocks === 1 ? "חסימה" : `${day.blocks} חסימות`}
                    </span>
                  ) : null}

                  {day?.entries.slice(0, MONTH_PREVIEW_LIMIT).map((entry, i) => (
                    <span
                      key={i}
                      className="flex items-baseline gap-1 truncate text-[11px] leading-tight"
                      title={`${entry.time} · ${entry.name}`}
                    >
                      <span className="shrink-0 tabular-nums text-primary">{entry.time}</span>
                      <span className="truncate text-muted-foreground">{entry.name}</span>
                    </span>
                  ))}

                  {day && day.entries.length > MONTH_PREVIEW_LIMIT && (
                    <span className="text-[11px] text-muted-foreground">
                      +{day.entries.length - MONTH_PREVIEW_LIMIT} נוספות
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
                  <RoomActionForm
                    roomId={room.id}
                    date={date}
                    therapists={therapists}
                    onDone={() => {
                      setFormForRoom(null);
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

function RoomActionForm({
  roomId,
  date,
  therapists,
  onDone,
  onError,
}: {
  roomId: string;
  date: string;
  therapists: Therapist[];
  onDone: () => void;
  onError: (error: string | null) => void;
}) {
  const [mode, setMode] = useState<"booking" | "block">("booking");
  const [therapistQuery, setTherapistQuery] = useState("");
  const [selectedTherapistId, setSelectedTherapistId] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const filteredTherapists = therapists
    .filter((t) => t.full_name.includes(therapistQuery) || t.phone.includes(therapistQuery))
    .slice(0, 8);

  async function handleSubmit() {
    onError(null);
    const { start } = dayBoundaries(date);
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const startsAt = new Date(start.getTime() + (sh * 60 + sm) * 60_000).toISOString();
    const endsAt = new Date(start.getTime() + (eh * 60 + em) * 60_000).toISOString();

    setLoading(true);
    const result =
      mode === "booking"
        ? await (async () => {
            if (!selectedTherapistId) return { ok: false, error: "יש לבחור מטפל/ת" } as const;
            return adminCreateBookingAction(selectedTherapistId, roomId, startsAt, endsAt, note);
          })()
        : await createRoomBlockAction(roomId, startsAt, endsAt, note || "תחזוקה");
    setLoading(false);

    if (!result.ok) {
      onError(result.error);
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex gap-2">
        <Button size="sm" variant={mode === "booking" ? "default" : "outline"} onClick={() => setMode("booking")}>
          שיבוץ מטפל/ת
        </Button>
        <Button size="sm" variant={mode === "block" ? "default" : "outline"} onClick={() => setMode("block")}>
          חסימת תחזוקה
        </Button>
      </div>

      {mode === "booking" && (
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
      <Input placeholder="הערה" value={note} onChange={(e) => setNote(e.target.value)} />

      <Button size="sm" onClick={handleSubmit} disabled={loading}>
        {loading ? "שומר..." : "שמירה"}
      </Button>
    </div>
  );
}
