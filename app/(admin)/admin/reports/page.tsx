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
    { data: punchCards },
    { data: therapists },
    { data: recentBookingsByUser },
  ] = await Promise.all([
    supabase.from("payments").select("amount_total, paid_at").eq("status", "paid").gte("paid_at", sixMonthsAgo),
    supabase.from("bookings").select("room_id").eq("status", "confirmed").gte("starts_at", thirtyDaysAgo),
    supabase.from("rooms").select("id, name"),
    supabase
      .from("punch_cards")
      .select("user_id, hours_remaining")
      .eq("active", true)
      .gt("hours_remaining", 0)
      .gt("expires_at", new Date().toISOString()),
    supabase
      .from("profiles")
      .select("id, full_name, phone, created_at")
      .eq("role", "therapist")
      .eq("status", "active")
      .lt("created_at", sixtyDaysAgo),
    supabase.from("bookings").select("user_id, starts_at").eq("status", "confirmed").gte("starts_at", sixtyDaysAgo),
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

  // יתרות פתוחות
  const hoursByUser = new Map<string, number>();
  for (const c of punchCards ?? []) {
    hoursByUser.set(c.user_id, (hoursByUser.get(c.user_id) ?? 0) + c.hours_remaining);
  }
  const userIds = [...hoursByUser.keys()];
  const { data: userProfiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] };
  const nameById = new Map((userProfiles ?? []).map((p) => [p.id, p.full_name]));
  const openBalances = userIds
    .map((id) => ({ name: nameById.get(id) ?? id, hours: hoursByUser.get(id)! }))
    .sort((a, b) => b.hours - a.hours);

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
        openBalances={openBalances}
        inactiveTherapists={inactive}
      />
    </div>
  );
}
