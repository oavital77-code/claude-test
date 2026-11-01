import { formatInTimeZone } from "date-fns-tz";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { TIMEZONE, isoDaysAgo } from "@/lib/time";
import { Card, CardContent } from "@/components/ui/card";
import { ReportsClient } from "./reports-client";
import { LinkClicksCard } from "./link-clicks-card";

function StatTile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-3xl font-semibold tabular-nums">{value.toLocaleString("he-IL")}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  );
}

export default async function AdminReportsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const sixMonthsAgo = isoDaysAgo(183);
  const thirtyDaysAgo = isoDaysAgo(30);
  const sixtyDaysAgo = isoDaysAgo(60);

  const [
    { data: recentPayments },
    { data: recentBookings },
    { data: rooms },
    { data: branches },
    { data: therapists },
    { data: recentBookingsByUser },
    { data: allActiveCards },
    { data: subscriptions },
    { count: therapistCount },
    { data: linkClickStats },
  ] = await Promise.all([
    supabase.from("payments").select("amount_total, paid_at").eq("status", "paid").gte("paid_at", sixMonthsAgo),
    supabase.from("bookings").select("room_id").eq("status", "confirmed").gte("starts_at", thirtyDaysAgo),
    supabase.from("rooms").select("id, name, branch_id"),
    supabase.from("branches").select("id, name").order("sort_order", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, phone, created_at")
      .eq("role", "therapist")
      .eq("status", "active")
      .lt("created_at", sixtyDaysAgo),
    supabase.from("bookings").select("user_id, starts_at").eq("status", "confirmed").gte("starts_at", sixtyDaysAgo),
    supabase
      .from("punch_cards")
      .select("user_id, hours_remaining, hours_purchased")
      .eq("active", true)
      .gt("expires_at", new Date().toISOString()),
    supabase
      .from("session_subscriptions")
      .select("user_id, status, weekly_hours, monthly_price, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "therapist").eq("status", "active"),
    supabase.rpc("admin_link_click_stats"),
  ]);

  // סיכום: ססיות פעילות, כרטיסיות בתוקף ועם יתרה חיובית
  const activeSubs = (subscriptions ?? []).filter((s) => s.status === "active" || s.status === "pending_cancellation");
  const cardsWithBalance = (allActiveCards ?? []).filter((c) => c.hours_remaining > 0);

  // הכנסות חודשיות
  const revenueByMonth = new Map<string, number>();
  for (const p of recentPayments ?? []) {
    if (!p.paid_at) continue;
    const key = formatInTimeZone(new Date(p.paid_at), TIMEZONE, "yyyy-MM");
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + p.amount_total);
  }
  const monthlyRevenue = [...revenueByMonth.entries()].sort(([a], [b]) => a.localeCompare(b));

  // תפוסה לפי חדר (30 יום אחרונים) — לפי סניף, כי שני סניפים יכולים
  // להשתמש באותו שם חדר ("Room 2" וכו') על room_id שונה לגמרי.
  const roomById = new Map((rooms ?? []).map((r) => [r.id, r]));
  const occupancyByRoom = new Map<string, number>();
  for (const b of recentBookings ?? []) {
    occupancyByRoom.set(b.room_id, (occupancyByRoom.get(b.room_id) ?? 0) + 1);
  }
  const occupancy = [...occupancyByRoom.entries()]
    .map(([roomId, count]) => {
      const room = roomById.get(roomId);
      return { room: room?.name ?? roomId, branchId: room?.branch_id ?? "", count };
    })
    .sort((a, b) => b.count - a.count);

  // שעות כרטיסיות לפי מטפל/ת (נותרו + נרכשו, כולל יתרה 0)
  const cardHoursByUser = new Map<string, { remaining: number; purchased: number }>();
  for (const c of allActiveCards ?? []) {
    const cur = cardHoursByUser.get(c.user_id) ?? { remaining: 0, purchased: 0 };
    cur.remaining += c.hours_remaining;
    cur.purchased += c.hours_purchased;
    cardHoursByUser.set(c.user_id, cur);
  }

  // כל השמות הדרושים (שעות כרטיסיות + ססיות) בשליפה אחת
  const allNeededUserIds = [
    ...new Set([...cardHoursByUser.keys(), ...(subscriptions ?? []).map((s) => s.user_id)]),
  ];
  const { data: userProfiles } = allNeededUserIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", allNeededUserIds)
    : { data: [] };
  const nameById = new Map((userProfiles ?? []).map((p) => [p.id, p.full_name]));

  const cardHoursByTherapist = [...cardHoursByUser.entries()]
    .map(([id, h]) => ({ name: nameById.get(id) ?? id, remaining: h.remaining, purchased: h.purchased }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));

  const sessionsByTherapist = (subscriptions ?? [])
    .map((s) => ({
      name: nameById.get(s.user_id) ?? s.user_id,
      status: s.status,
      weeklyHours: s.weekly_hours,
      monthlyPrice: s.monthly_price,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));

  // מטפלים לא פעילים 60 יום
  const activeUserIds = new Set((recentBookingsByUser ?? []).map((b) => b.user_id));
  const inactive = (therapists ?? [])
    .filter((t) => !activeUserIds.has(t.id))
    .map((t) => ({ name: t.full_name, phone: t.phone }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">דוחות</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="מטפלים פעילים" value={therapistCount ?? 0} />
        <StatTile
          label="ססיות פעילות"
          value={activeSubs.length}
          hint={`אצל ${new Set(activeSubs.map((s) => s.user_id)).size} מטפלים`}
        />
        <StatTile
          label="כרטיסיות פעילות"
          value={cardsWithBalance.length}
          hint={`בתוקף ועם יתרה · אצל ${new Set(cardsWithBalance.map((c) => c.user_id)).size} מטפלים`}
        />
      </div>
      <LinkClicksCard stats={linkClickStats ?? []} />
      <ReportsClient
        monthlyRevenue={monthlyRevenue}
        occupancy={occupancy}
        branches={branches ?? []}
        inactiveTherapists={inactive}
        cardHoursByTherapist={cardHoursByTherapist}
        sessionsByTherapist={sessionsByTherapist}
      />
    </div>
  );
}
