import { formatInTimeZone } from "date-fns-tz";
import { he } from "date-fns/locale";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { TIMEZONE } from "@/lib/time";
import { dayBoundaries, todayInIsrael, weekDatesStartingSunday } from "@/lib/availability/grid";
import { Card, CardContent } from "@/components/ui/card";
import type { Database } from "@/lib/supabase/types";

type BookingSource = Database["public"]["Tables"]["bookings"]["Row"]["source"];

const SOURCE_LABELS: Record<BookingSource, string> = {
  punch_card: "כרטיסייה",
  session: "ססיה",
  admin_comp: "שיבוץ אדמין",
};

export default async function AdminDashboardPage() {
  const { profile } = await requireAdmin();
  const supabase = await createClient();

  const today = todayInIsrael();
  const { start: todayStartDate, end: todayEndDate } = dayBoundaries(today);
  const todayStart = todayStartDate.toISOString();
  const todayEnd = todayEndDate.toISOString();

  const weekDates = weekDatesStartingSunday(today);
  const weekStart = dayBoundaries(weekDates[0]).start.toISOString();
  const weekEnd = dayBoundaries(weekDates[6]).end.toISOString();

  const [
    { data: todayBookingsList },
    { data: newBookingsToday },
    { data: expiringCardsThisWeek },
    { data: endingSessionsThisWeek },
    { data: rooms },
    { data: branches },
  ] = await Promise.all([
    // כל הפעילות (הזמנות) של היום — מתי ה*תור* מתקיים (starts_at).
    supabase
      .from("bookings")
      .select("id, room_id, user_id, starts_at, ends_at, source")
      .eq("status", "confirmed")
      .gte("starts_at", todayStart)
      .lt("starts_at", todayEnd)
      .order("starts_at", { ascending: true }),
    // הזמנות חדשות שנוצרו היום — מתי ה*הזמנה עצמה* בוצעה (created_at), לא מתי התור.
    supabase
      .from("bookings")
      .select("id, source")
      .eq("status", "confirmed")
      .gte("created_at", todayStart)
      .lt("created_at", todayEnd),
    // כרטיסיות שפגות בשבוע הנוכחי (ראשון-שבת)
    supabase
      .from("punch_cards")
      .select("id, user_id, expires_at")
      .eq("active", true)
      .gte("expires_at", weekStart)
      .lt("expires_at", weekEnd)
      .order("expires_at", { ascending: true }),
    // ססיות (מנויים) שמסתיימות בשבוע הנוכחי — בביטול, effective_end_date בטווח
    supabase
      .from("session_subscriptions")
      .select("id, user_id, effective_end_date")
      .eq("status", "pending_cancellation")
      .gte("effective_end_date", weekDates[0])
      .lte("effective_end_date", weekDates[6])
      .order("effective_end_date", { ascending: true }),
    supabase.from("rooms").select("id, name, branch_id"),
    supabase.from("branches").select("id, name"),
  ]);

  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const roomById = new Map((rooms ?? []).map((r) => [r.id, r]));

  const therapistIds = [
    ...new Set([
      ...(todayBookingsList ?? []).map((b) => b.user_id),
      ...(expiringCardsThisWeek ?? []).map((c) => c.user_id),
      ...(endingSessionsThisWeek ?? []).map((s) => s.user_id),
    ]),
  ];
  const { data: therapistProfiles } = therapistIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", therapistIds)
    : { data: [] };
  const therapistNameById = new Map((therapistProfiles ?? []).map((p) => [p.id, p.full_name]));

  const todayActivity = (todayBookingsList ?? []).map((b) => {
    const room = roomById.get(b.room_id);
    return {
      id: b.id,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      roomName: room?.name ?? b.room_id,
      branchName: room ? (branchNameById.get(room.branch_id) ?? "") : "",
      therapistName: therapistNameById.get(b.user_id) ?? "מטפל/ת",
      source: b.source,
    };
  });

  const newTodayBySource: Record<BookingSource, number> = { punch_card: 0, session: 0, admin_comp: 0 };
  for (const b of newBookingsToday ?? []) {
    newTodayBySource[b.source]++;
  }
  const newTodayTotal = (newBookingsToday ?? []).length;

  const endingThisWeek = [
    ...(expiringCardsThisWeek ?? []).map((c) => ({
      id: `card-${c.id}`,
      kind: "כרטיסייה",
      date: c.expires_at,
      therapistName: therapistNameById.get(c.user_id) ?? "מטפל/ת",
    })),
    ...(endingSessionsThisWeek ?? []).map((s) => ({
      id: `session-${s.id}`,
      kind: "ססיה",
      date: dayBoundaries(s.effective_end_date!).start.toISOString(),
      therapistName: therapistNameById.get(s.user_id) ?? "מטפל/ת",
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">דשבורד — שלום, {profile.full_name}</h1>

      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <p className="font-medium">הזמנות חדשות היום</p>
          <p className="text-2xl font-semibold">{newTodayTotal}</p>
          <p className="text-sm text-muted-foreground">
            {newTodayBySource.punch_card} כרטיסייה · {newTodayBySource.session} ססיה
            {newTodayBySource.admin_comp > 0 ? ` · ${newTodayBySource.admin_comp} שיבוץ אדמין` : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <p className="font-medium">כל הפעילות היום</p>
          {todayActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין הזמנות היום.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {todayActivity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <span>
                    <span dir="ltr">
                      {formatInTimeZone(new Date(a.startsAt), TIMEZONE, "HH:mm")}–
                      {formatInTimeZone(new Date(a.endsAt), TIMEZONE, "HH:mm")}
                    </span>{" "}
                    · {a.branchName ? `${a.branchName} · ` : ""}
                    {a.roomName} · {a.therapistName}
                  </span>
                  <span className="text-xs text-muted-foreground">{SOURCE_LABELS[a.source]}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <p className="font-medium">מסתיימות השבוע</p>
          {endingThisWeek.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין כרטיסיות או ססיות שמסתיימות השבוע.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {endingThisWeek.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <span>
                    {e.therapistName} · {e.kind}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatInTimeZone(new Date(e.date), TIMEZONE, "EEEE, dd/MM", { locale: he })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
