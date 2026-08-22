import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TIMEZONE } from "@/lib/time";
import { dayBoundaries, todayInIsrael, addDaysToDateStr } from "@/lib/availability/grid";
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
  const monthStartDateStr = formatInTimeZone(todayStartDate, TIMEZONE, "yyyy-MM") + "-01";
  const monthStart = dayBoundaries(monthStartDateStr).start.toISOString();
  const in30Days = dayBoundaries(addDaysToDateStr(today, 30)).start.toISOString();

  const [
    { count: roomsCount },
    { count: todayBookings },
    { data: monthPayments },
    { count: pendingSessions },
    { data: failedPayments },
    { data: expiringCards },
    { data: todayBookingsList },
    { data: rooms },
    { data: branches },
  ] = await Promise.all([
    supabase.from("rooms").select("id", { count: "exact", head: true }).eq("active", true),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "confirmed")
      .gte("starts_at", todayStart)
      .lt("starts_at", todayEnd),
    supabase.from("payments").select("amount_total").eq("status", "paid").gte("paid_at", monthStart),
    supabase.from("session_subscriptions").select("id", { count: "exact", head: true }).eq("status", "requested"),
    supabase
      .from("payments")
      .select("id, user_id, amount_total, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("punch_cards")
      .select("id, user_id, expires_at")
      .eq("active", true)
      .lte("expires_at", in30Days)
      .gte("expires_at", todayStart)
      .limit(5),
    // כל הפעילות (הזמנות) של היום, בכל הסניפים והחדרים, למסך הראשי.
    supabase
      .from("bookings")
      .select("id, room_id, user_id, starts_at, ends_at, source")
      .eq("status", "confirmed")
      .gte("starts_at", todayStart)
      .lt("starts_at", todayEnd)
      .order("starts_at", { ascending: true }),
    supabase.from("rooms").select("id, name, branch_id"),
    supabase.from("branches").select("id, name"),
  ]);

  const monthRevenue = (monthPayments ?? []).reduce((sum, p) => sum + p.amount_total, 0);

  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const roomById = new Map((rooms ?? []).map((r) => [r.id, r]));
  const therapistIds = [...new Set((todayBookingsList ?? []).map((b) => b.user_id))];
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

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">דשבורד — שלום, {profile.full_name}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="הזמנות היום" value={String(todayBookings ?? 0)} sub={`מתוך ${roomsCount ?? 0} חדרים פעילים`} />
        <Metric label="הכנסות החודש" value={formatCurrency(monthRevenue)} />
        <Metric
          label="בקשות ססיה ממתינות"
          value={String(pendingSessions ?? 0)}
          highlight={Boolean(pendingSessions)}
          href="/admin/sessions"
        />
        <Metric label="כרטיסיות פגות תוך 30 יום" value={String(expiringCards?.length ?? 0)} />
      </div>

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

      {failedPayments && failedPayments.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <p className="font-medium text-destructive">חיובים שנכשלו לאחרונה</p>
            <ul className="flex flex-col gap-1 text-sm">
              {failedPayments.map((p) => (
                <li key={p.id}>
                  {formatCurrency(p.amount_total)} · {new Date(p.created_at).toLocaleDateString("he-IL")}
                </li>
              ))}
            </ul>
            <Link href="/admin/payments" className="text-sm text-primary underline-offset-4 hover:underline">
              לכל התשלומים
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  highlight,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  href?: string;
}) {
  const content = (
    <Card className={cn("h-full", highlight && "border-amber-500")}>
      <CardContent className="flex flex-col gap-1 p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}
