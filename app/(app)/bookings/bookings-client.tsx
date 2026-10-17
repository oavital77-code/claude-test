"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";

import { TIMEZONE, accessWindow } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Card, CardContent } from "@/components/ui/card";
import type { Database } from "@/lib/supabase/types";
import { GRID_END_HOUR, GRID_START_HOUR, addDaysToDateStr, israelDateTime, todayInIsrael } from "@/lib/availability/grid";
import { cancelBookingAction, rescheduleBookingAction } from "./actions";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];
export type BookingWithRoom = Booking & { roomName: string; branchName: string };

const SOURCE_LABELS: Record<Booking["source"], string> = {
  punch_card: "כרטיסייה",
  session: "ססיה",
  admin_comp: "הענקת אדמין",
};

const STATUS_LABELS: Record<Booking["status"], string> = {
  confirmed: "מאושר",
  cancelled_by_user: "בוטל",
  cancelled_by_admin: "בוטל ע\"י ההנהלה",
  completed: "הושלם",
  no_show: "לא הגיע/ה",
};

export type RoomOption = { id: string; label: string };

type Policy = { cancelWindowHours: number; horizonDays: number; roomOptions: RoomOption[] };

export function BookingsClient({
  bookings,
  cancelWindowHours,
  horizonDays,
  roomOptions,
}: { bookings: BookingWithRoom[] } & Policy) {
  const policy: Policy = { cancelWindowHours, horizonDays, roomOptions };
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const now = useMemo(() => new Date(), []);

  const upcoming = bookings.filter((b) => b.status === "confirmed" && new Date(b.starts_at) > now);
  const history = bookings.filter((b) => !(b.status === "confirmed" && new Date(b.starts_at) > now));
  const list = tab === "upcoming" ? upcoming : history;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button size="sm" variant={tab === "upcoming" ? "default" : "outline"} onClick={() => setTab("upcoming")}>
          קרובות ({upcoming.length})
        </Button>
        <Button size="sm" variant={tab === "history" ? "default" : "outline"} onClick={() => setTab("history")}>
          היסטוריה
        </Button>
      </div>

      {list.length === 0 ? (
        <p className="text-muted-foreground">אין הזמנות להצגה.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((b) => (
            <BookingCard key={b.id} booking={b} policy={policy} />
          ))}
        </div>
      )}
    </div>
  );
}

function BookingCard({ booking, policy }: { booking: BookingWithRoom; policy: Policy }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const startsAt = useMemo(() => new Date(booking.starts_at), [booking.starts_at]);
  const endsAt = useMemo(() => new Date(booking.ends_at), [booking.ends_at]);
  const { accessStart, accessEnd } = accessWindow(startsAt, endsAt);
  const hoursBefore = (startsAt.getTime() - now.getTime()) / 3_600_000;
  const isCancellable = booking.status === "confirmed" && startsAt > now;
  const withinCancelWindow = hoursBefore < policy.cancelWindowHours;
  // שינוי — אותה חוקיות כמו ביטול: רק כרטיסייה, ורק מחוץ לחלון (reschedule_booking אוכף).
  const canReschedule = isCancellable && booking.source === "punch_card" && !withinCancelWindow;
  const windowLabel = `${policy.cancelWindowHours} שעות`;

  async function handleCancel() {
    if (booking.source === "session") return;
    const warning = withinCancelWindow
      ? `הביטול בתוך ${windowLabel} מהמועד — השעות לא יוחזרו ליתרה. להמשיך?`
      : "לבטל את ההזמנה? השעות יוחזרו ליתרה.";
    if (!window.confirm(warning)) return;

    setLoading(true);
    setError(null);
    const result = await cancelBookingAction(booking.id);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-medium">
            {booking.roomName} · {booking.branchName}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatInTimeZone(startsAt, TIMEZONE, "dd/MM/yyyy")} ·{" "}
            <span dir="ltr">
              {formatInTimeZone(startsAt, TIMEZONE, "HH:mm")}–{formatInTimeZone(endsAt, TIMEZONE, "HH:mm")}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            🔑 כניסה בפועל <span dir="ltr">{formatInTimeZone(accessStart, TIMEZONE, "HH:mm")}</span> · פינוי{" "}
            <span dir="ltr">{formatInTimeZone(accessEnd, TIMEZONE, "HH:mm")}</span>
          </p>
        </div>

        <div className="flex flex-col items-end gap-1 text-sm">
          <span className="text-muted-foreground">{SOURCE_LABELS[booking.source]}</span>
          {booking.status !== "confirmed" && (
            <span className="text-muted-foreground">{STATUS_LABELS[booking.status]}</span>
          )}
        </div>

        {isCancellable &&
          (booking.source === "session" ? (
            <span className="text-xs text-muted-foreground">ססיה קבועה — לביטול פנו להנהלה</span>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-2">
                {canReschedule && (
                  <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)} disabled={loading}>
                    {editing ? "סגירה" : "שינוי"}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleCancel} disabled={loading}>
                  {loading ? "מבטל..." : "ביטול הזמנה"}
                </Button>
              </div>
              {withinCancelWindow && (
                <span className="text-xs text-destructive">
                  פחות מ-{windowLabel} — אין שינוי, וביטול לא יחזיר את השעות
                </span>
              )}
            </div>
          ))}
      </CardContent>
      {editing && (
        <RescheduleForm
          booking={booking}
          policy={policy}
          onDone={(message) => {
            setEditing(false);
            setNotice(message);
            router.refresh();
          }}
        />
      )}
      {notice && <p className="px-4 pb-3 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      {error && <p className="px-4 pb-3 text-sm text-destructive">{error}</p>}
    </Card>
  );
}

const TIME_OPTIONS = Array.from({ length: (GRID_END_HOUR - GRID_START_HOUR) * 2 + 1 }, (_, i) => {
  const minutes = GRID_START_HOUR * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 === 0 ? "00" : "30"}`;
});

/**
 * טופס שינוי: תאריך, שעות וחדר. שמירה = reschedule_booking בפעולה אחת — אם
 * המועד החדש תפוס או שאין יתרה, ההזמנה המקורית נשארת בדיוק כמו שהייתה.
 */
function RescheduleForm({
  booking,
  policy,
  onDone,
}: {
  booking: BookingWithRoom;
  policy: Policy;
  onDone: (message: string) => void;
}) {
  const start = new Date(booking.starts_at);
  const end = new Date(booking.ends_at);
  const today = todayInIsrael();
  const [date, setDate] = useState(formatInTimeZone(start, TIMEZONE, "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState(formatInTimeZone(start, TIMEZONE, "HH:mm"));
  const [endTime, setEndTime] = useState(formatInTimeZone(end, TIMEZONE, "HH:mm"));
  const [roomId, setRoomId] = useState(booking.room_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unchanged =
    roomId === booking.room_id &&
    israelDateTime(date, startTime).getTime() === start.getTime() &&
    israelDateTime(date, endTime).getTime() === end.getTime();

  async function handleSave() {
    if (saving) return;
    if (endTime <= startTime) {
      setError("שעת הסיום חייבת להיות אחרי שעת ההתחלה.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await rescheduleBookingAction({
      bookingId: booking.id,
      roomId,
      // israelDateTime — נכון גם ביום מעבר שעון (ר' lib/availability/grid.ts)
      startsAt: israelDateTime(date, startTime).toISOString(),
      endsAt: israelDateTime(date, endTime).toISOString(),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const hoursNote =
      res.hoursDelta > 0
        ? ` ירדו עוד ${res.hoursDelta} ש׳ מהיתרה.`
        : res.hoursDelta < 0
          ? ` ${-res.hoursDelta} ש׳ הוחזרו ליתרה.`
          : "";
    onDone(`ההזמנה עודכנה ונשלח מייל עם המועד החדש.${hoursNote}`);
  }

  const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          תאריך
          <DateInput
            className="h-9 w-48 md:h-9"
            min={today}
            max={addDaysToDateStr(today, policy.horizonDays)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          משעה
          <select className={selectClass} value={startTime} onChange={(e) => setStartTime(e.target.value)}>
            {TIME_OPTIONS.slice(0, -1).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          עד שעה
          <select className={selectClass} value={endTime} onChange={(e) => setEndTime(e.target.value)}>
            {TIME_OPTIONS.slice(1).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          חדר
          <select className={selectClass} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {policy.roomOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" onClick={handleSave} disabled={saving || unchanged}>
          {saving ? "שומר..." : "שמירת השינוי"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        אם המועד החדש תפוס — ההזמנה הנוכחית נשארת כמו שהיא. הארכה תוריד שעות נוספות מהיתרה, קיצור יחזיר אותן.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
