import { formatInTimeZone } from "date-fns-tz";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { TIMEZONE, isoDaysAgo } from "@/lib/time";
import { ReportsClient } from "./reports-client";

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
    { data: therapists },
    { data: recentBookingsByUser },
    { data: allActiveCards },
    { data: subscriptions },
  ] = await Promise.all([
    supabase.from("payments").select("amount_total, paid_at").eq("status", "paid").gte("paid_at", sixMonthsAgo),
    supabase.from("bookings").select("room_id").eq("status", "confirmed").gte("starts_at", thirtyDaysAgo),
    supabase.from("rooms").select("id, name"),
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
  ]);

  // הכנסות חודשיות
  const revenueByMonth = new Map<string, number>();
  for (const p of recentPayments ?? []) {
    if (!p.paid_at) continue;
    const key = formatInTimeZone(new Date(p.paid_at), TIMEZONE, "yyyy-MM");
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + p.amount_total);
  }
  const monthlyRevenue = [...revenueByMonth.entries()].sort(([a], [b]) => a.localeCompare(b));

  // תפוסה לפי חדר (30 יום אחרונים)
  const roomNameById = new Map((rooms ?? []).map((r) => [r.id, r.name]));
  const occupancyByRoom = new Map<string, number>();
  for (const b of recentBookings ?? []) {
    occupancyByRoom.set(b.room_id, (occupancyByRoom.get(b.room_id) ?? 0) + 1);
  }
  const occupancy = [...occupancyByRoom.entries()]
    .map(([roomId, count]) => ({ room: roomNameById.get(roomId) ?? roomId, count }))
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
      <ReportsClient
        monthlyRevenue={monthlyRevenue}
        occupancy={occupancy}
        inactiveTherapists={inactive}
        cardHoursByTherapist={cardHoursByTherapist}
        sessionsByTherapist={sessionsByTherapist}
      />
    </div>
  );
}
