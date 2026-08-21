"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
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

  const currentBranchName = branches.find((b) => b.id === branchId)?.name ?? "";

  return (
    <div className="flex flex-col gap-4">
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

        <div className="mx-2 h-6 w-px bg-border" />

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

        <div className="mx-2 h-6 w-px bg-border" />

        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSelected(null);
            setDate(addDaysToDateStr(date, view === "day" ? -1 : -7));
          }}
        >
          הקודם
        </Button>
        <span className="text-sm font-medium">
          {formatInTimeZone(dayBoundaries(date).start, TIMEZONE, "dd/MM/yyyy")}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSelected(null);
            setDate(addDaysToDateStr(date, view === "day" ? 1 : 7));
          }}
        >
          הבא
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

        <div className="mx-2 h-6 w-px bg-border" />

        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={roomTypeFilter}
          onChange={(e) => {
            setSelected(null);
            setRoomTypeFilter(e.target.value as Room["room_type"] | "all");
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

      <p className="text-sm text-muted-foreground">
        לחצו על משבצת <span className="font-medium text-foreground">פנויה</span> כדי לקבוע תור. אפשר
        ללחוץ על עוד משבצות פנויות באותה עמודה כדי להאריך את ההזמנה.
      </p>
      <Legend />

      <AvailabilityGrid
        columns={columns}
        slots={slots}
        statusFor={statusFor}
        onSlotClick={handleSlotClick}
        isSelected={(columnKey, slot) => {
          if (!selected || selected.columnKey !== columnKey) return false;
          const { start, end } = resolveSlot(columnKey, slot);
          return start >= selected.start && end <= selected.end;
        }}
      />

      {selected && (
        // pointer-events-none על העטיפה כדי שלחיצות על שאר הלוח (מחוץ לכרטיס)
        // ימשיכו להגיע למשבצות — כך אפשר להמשיך ולהרחיב את הבחירה בזמן
        // שהכרטיס פתוח, ולא רק לבטל אותו. הכרטיס עצמו קבוע בתחתית המסך כדי
        // שיישאר גלוי גם בלוח יום ארוך (48 שורות) בלי תלות בגלילה.
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
          <div className="pointer-events-auto w-full max-w-sm shadow-lg">
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

  return (
    <div className="rounded-md border bg-card p-4 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">
          {branchName ? `${branchName} · ` : ""}
          {roomName} · {formatInTimeZone(start, TIMEZONE, "dd/MM/yyyy")}
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          ✕
        </button>
      </div>
      <p dir="ltr" className="text-right">
        {formatInTimeZone(start, TIMEZONE, "HH:mm")}–{formatInTimeZone(end, TIMEZONE, "HH:mm")}
      </p>
      <p className="text-muted-foreground">משך: {(end.getTime() - start.getTime()) / (60 * 60 * 1000)} שעות</p>
      <p className="text-xs text-muted-foreground">אפשר עדיין ללחוץ על משבצות פנויות נוספות כדי להאריך.</p>
      <p className="text-muted-foreground">
        🔑 כניסה בפועל:{" "}
        <span dir="ltr">{formatInTimeZone(accessStart, TIMEZONE, "HH:mm")}</span> · פינוי:{" "}
        <span dir="ltr">{formatInTimeZone(accessEnd, TIMEZONE, "HH:mm")}</span>
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
