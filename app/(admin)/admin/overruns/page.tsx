import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { isoDaysAgo } from "@/lib/time";
import { OverrunClient, type BookingOption } from "./overrun-client";

export default async function AdminOverrunsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, user_id, room_id, starts_at, ends_at, status")
    .in("status", ["confirmed", "completed"])
    .gte("starts_at", isoDaysAgo(14))
    .order("starts_at", { ascending: false })
    .limit(200);

  const userIds = [...new Set((bookings ?? []).map((b) => b.user_id))];
  const roomIds = [...new Set((bookings ?? []).map((b) => b.room_id))];

  const [{ data: profiles }, { data: rooms }] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] }),
    roomIds.length ? supabase.from("rooms").select("id, name").in("id", roomIds) : Promise.resolve({ data: [] }),
  ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const roomNameById = new Map((rooms ?? []).map((r) => [r.id, r.name]));

  const options: BookingOption[] = (bookings ?? []).map((b) => ({
    id: b.id,
    label: `${nameById.get(b.user_id) ?? ""} · ${roomNameById.get(b.room_id) ?? ""} · ${new Date(b.starts_at).toLocaleString("he-IL")}`,
  }));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">רישום חריגה</h1>
      <OverrunClient bookingOptions={options} />
    </div>
  );
}
