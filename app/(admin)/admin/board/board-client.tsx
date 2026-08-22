"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";

import { createClient } from "@/lib/supabase/client";
import { TIMEZONE } from "@/lib/time";
import { dayBoundaries, daySlots, todayInIsrael, addDaysToDateStr, type Slot } from "@/lib/availability/grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { Database } from "@/lib/supabase/types";
import type { SlotStatus } from "@/lib/availability/types";
import { AvailabilityGrid, Legend, type GridColumn } from "@/app/(app)/schedule/availability-grid";
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
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  useEffect(() => {
    supabase
      .from("rooms")
      .select("*")
      .eq("branch_id", branchId)
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setRooms(data ?? []));
  }, [supabase, branchId]);

  const roomIds = useMemo(() => rooms.map((r) => r.id), [rooms]);
  const { start, end } = useMemo(() => dayBoundaries(date), [date]);
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
      return b ? (therapistById.get(b.user_id)?.full_name ?? "מטפל/ת") : undefined;
    }
    if (status === "blocked") {
      const rb = blockAt(roomId, slot);
      return rb ? `חסום: ${rb.reason}` : undefined;
    }
    return undefined;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {branches.map((b) => (
          <Button key={b.id} size="sm" variant={b.id === branchId ? "default" : "outline"} onClick={() => setBranchId(b.id)}>
            {b.name}
          </Button>
        ))}
        <div className="mx-2 h-6 w-px bg-border" />
        <Button size="sm" variant="outline" onClick={() => setDate(addDaysToDateStr(date, -1))}>
          הקודם
        </Button>
        <span className="text-sm font-medium">{formatInTimeZone(start, TIMEZONE, "dd/MM/yyyy")}</span>
        <Button size="sm" variant="outline" onClick={() => setDate(addDaysToDateStr(date, 1))}>
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
          />
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
