"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";

import { createClient } from "@/lib/supabase/client";
import { accessWindow, TIMEZONE } from "@/lib/time";
import {
  fetchRooms,
  fetchRoomAvailability,
  slotStatus,
} from "@/lib/availability/queries";
import {
  daySlots,
  dayBoundaries,
  todayInIsrael,
  addDaysToDateStr,
  weekDatesStartingSunday,
} from "@/lib/availability/grid";
import type { Database } from "@/lib/supabase/types";
import type { AvailabilityInterval } from "@/lib/availability/types";
import type { Slot } from "@/lib/availability/grid";
import { Button } from "@/components/ui/button";
import { AvailabilityGrid, Legend, type GridColumn } from "./availability-grid";
import { bookSlot } from "./actions";

type Branch = Database["public"]["Tables"]["branches"]["Row"];
type Room = Database["public"]["Tables"]["rooms"]["Row"];

const ROOM_TYPE_LABELS: Record<Room["room_type"], string> = {
  talk: "שיח",
  touch: "מגע",
  podcast: "פודקאסט",
  group: "קבוצתי",
};

export function ScheduleClient({
  branches,
  userId,
}: {
  branches: Branch[];
  userId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [view, setView] = useState<"day" | "week">("day");
  const [date, setDate] = useState(todayInIsrael());
  const [roomTypeFilter, setRoomTypeFilter] = useState<Room["room_type"] | "all">("all");
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
    () => (roomTypeFilter === "all" ? rooms : rooms.filter((r) => r.room_type === roomTypeFilter)),
    [rooms, roomTypeFilter],
  );

  const { rangeStart, rangeEnd, slots, columns, slotsAnchorDate } = useMemo(() => {
    if (view === "day") {
      const { start, end } = dayBoundaries(date);
      const cols: GridColumn[] = filteredRooms.map((r) => ({ key: r.id, label: r.name }));
      return { rangeStart: start, rangeEnd: end, slots: daySlots(date), columns: cols, slotsAnchorDate: date };
    }
    const weekDates = weekDatesStartingSunday(date);
    const start = dayBoundaries(weekDates[0]).start;
    const end = dayBoundaries(weekDates[6]).end;
    const cols: GridColumn[] = weekDates.map((d) => ({
      key: d,
      label: formatInTimeZone(dayBoundaries(d).start, TIMEZONE, "EEEEEE dd/MM"),
    }));
    return {
      rangeStart: start,
      rangeEnd: end,
      slots: daySlots(weekDates[0]),
      columns: cols,
      slotsAnchorDate: weekDates[0],
    };
  }, [view, date, filteredRooms]);

  const roomIdsForQuery = useMemo(
    () => (view === "day" ? filteredRooms.map((r) => r.id) : [selectedRoomId]).filter(Boolean),
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

  function handleSlotClick(columnKey: string, slot: Slot) {
    const { roomId, start, end } = resolveSlot(columnKey, slot);
    const roomName = rooms.find((r) => r.id === roomId)?.name ?? "";
    setSelected({ columnKey, roomId, roomName, start, end });
  }

  function statusFor(columnKey: string, slot: Slot) {
    const { roomId, start, end } = resolveSlot(columnKey, slot);
    const dayIntervals =
      view === "day"
        ? availability.get(roomId)
        : (availability.get(roomId) ?? []).filter((iv) => {
            const dayStart = dayBoundaries(columnKey).start;
            const dayEnd = dayBoundaries(columnKey).end;
            return iv.startsAt < dayEnd && iv.endsAt > dayStart;
          });
    return slotStatus(start, end, dayIntervals);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {branches.map((b) => (
          <Button
            key={b.id}
            size="sm"
            variant={b.id === branchId ? "default" : "outline"}
            onClick={() => setBranchId(b.id)}
          >
            {b.name}
          </Button>
        ))}

        <div className="mx-2 h-6 w-px bg-border" />

        <Button size="sm" variant={view === "day" ? "default" : "outline"} onClick={() => setView("day")}>
          יום
        </Button>
        <Button size="sm" variant={view === "week" ? "default" : "outline"} onClick={() => setView("week")}>
          שבוע
        </Button>

        <div className="mx-2 h-6 w-px bg-border" />

        <Button size="sm" variant="outline" onClick={() => setDate(addDaysToDateStr(date, view === "day" ? -1 : -7))}>
          הקודם
        </Button>
        <span className="text-sm font-medium">
          {formatInTimeZone(dayBoundaries(date).start, TIMEZONE, "dd/MM/yyyy")}
        </span>
        <Button size="sm" variant="outline" onClick={() => setDate(addDaysToDateStr(date, view === "day" ? 1 : 7))}>
          הבא
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDate(todayInIsrael())}>
          היום
        </Button>

        <div className="mx-2 h-6 w-px bg-border" />

        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={roomTypeFilter}
          onChange={(e) => setRoomTypeFilter(e.target.value as Room["room_type"] | "all")}
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
            onChange={(e) => setSelectedRoomId(e.target.value)}
          >
            {filteredRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        לחצו על משבצת <span className="font-medium text-foreground">פנויה</span> כדי לקבוע תור.
      </p>
      <Legend />

      <AvailabilityGrid
        columns={columns}
        slots={slots}
        statusFor={statusFor}
        onSlotClick={handleSlotClick}
        selectedKey={selected ? `${selected.roomId}|${selected.start.toISOString()}` : null}
      />

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
            <SlotPreview
              roomId={selected.roomId}
              roomName={selected.roomName}
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
  start,
  end,
  onClose,
  onBooked,
}: {
  roomId: string;
  roomName: string;
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

  return (
    <div className="rounded-md border bg-card p-4 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">
          {roomName} · {formatInTimeZone(start, TIMEZONE, "dd/MM/yyyy")}
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          ✕
        </button>
      </div>
      <p>
        {formatInTimeZone(start, TIMEZONE, "HH:mm")}–{formatInTimeZone(end, TIMEZONE, "HH:mm")}
      </p>
      <p className="text-muted-foreground">
        🔑 כניסה בפועל: {formatInTimeZone(accessStart, TIMEZONE, "HH:mm")} · פינוי:{" "}
        {formatInTimeZone(accessEnd, TIMEZONE, "HH:mm")}
      </p>

      {confirmed ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-emerald-600 dark:text-emerald-400">
            ההזמנה אושרה! יתרה לאחר ההזמנה: {confirmed.hoursRemaining} שעות.
          </p>
          <Button size="sm" onClick={onBooked}>
            סגירה
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {error && <p className="text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleConfirm} disabled={loading}>
              {loading ? "מזמין..." : "אישור הזמנה"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              ביטול
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
