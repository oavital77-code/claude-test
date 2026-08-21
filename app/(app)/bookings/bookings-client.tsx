"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";

import { TIMEZONE, accessWindow } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Database } from "@/lib/supabase/types";
import { cancelBookingAction } from "./actions";

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

export function BookingsClient({ bookings }: { bookings: BookingWithRoom[] }) {
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
            <BookingCard key={b.id} booking={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function BookingCard({ booking }: { booking: BookingWithRoom }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const startsAt = useMemo(() => new Date(booking.starts_at), [booking.starts_at]);
  const endsAt = useMemo(() => new Date(booking.ends_at), [booking.ends_at]);
  const { accessStart, accessEnd } = accessWindow(startsAt, endsAt);
  const hoursBefore = (startsAt.getTime() - now.getTime()) / 3_600_000;
  const isCancellable = booking.status === "confirmed" && startsAt > now;
  const withinCancelWindow = hoursBefore < 24;

  async function handleCancel() {
    if (booking.source === "session") return;
    const warning = withinCancelWindow
      ? "הביטול בתוך 24 שעות מהמועד — השעות לא יוחזרו ליתרה. להמשיך?"
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
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={loading}>
                {loading ? "מבטל..." : "ביטול הזמנה"}
              </Button>
              {withinCancelWindow && (
                <span className="text-xs text-destructive">פחות מ-24 שעות — השעות לא יוחזרו</span>
              )}
            </div>
          ))}
      </CardContent>
      {error && <p className="px-4 pb-3 text-sm text-destructive">{error}</p>}
    </Card>
  );
}
