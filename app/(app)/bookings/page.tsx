import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { BookingsClient, type BookingWithRoom } from "./bookings-client";
import { CalendarSyncLink } from "./calendar-sync-link";

export default async function BookingsPage() {
  const { userId, profile } = await requireTherapistProfile();
  const supabase = await createClient();

  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("user_id", userId)
    .order("starts_at", { ascending: false });

  const roomIds = [...new Set((bookings ?? []).map((b) => b.room_id))];
  const { data: rooms } = roomIds.length
    ? await supabase.from("rooms").select("id, name, branch_id").in("id", roomIds)
    : { data: [] };

  const branchIds = [...new Set((rooms ?? []).map((r) => r.branch_id))];
  const { data: branches } = branchIds.length
    ? await supabase.from("branches").select("id, name").in("id", branchIds)
    : { data: [] };

  const branchById = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const roomById = new Map(
    (rooms ?? []).map((r) => [r.id, { name: r.name, branchName: branchById.get(r.branch_id) ?? "" }]),
  );

  const bookingsWithRoom: BookingWithRoom[] = (bookings ?? []).map((b) => ({
    ...b,
    roomName: roomById.get(b.room_id)?.name ?? "",
    branchName: roomById.get(b.room_id)?.branchName ?? "",
  }));

  // חלון הביטול/השינוי וטווח ההזמנה — מ-app_settings, אותם ערכים שה-RPCs
  // אוכפים (cancel_booking / reschedule_booking / create_booking).
  const [{ data: settings }, { data: activeRooms }, { data: allBranches }] = await Promise.all([
    supabase.from("app_settings").select("key, value").in("key", ["cancel_window_hours", "booking_horizon_days"]),
    supabase.from("rooms").select("id, name, branch_id, sort_order").eq("active", true).order("sort_order"),
    supabase.from("branches").select("id, name"),
  ]);
  const setting = (key: string, fallback: number) => {
    const raw = settings?.find((s) => s.key === key)?.value;
    const n = Number(raw);
    return Number.isFinite(n) && raw !== null && raw !== undefined ? n : fallback;
  };
  const allBranchById = new Map((allBranches ?? []).map((b) => [b.id, b.name]));
  const roomOptions = (activeRooms ?? []).map((r) => ({
    id: r.id,
    label: `${r.name} · ${allBranchById.get(r.branch_id) ?? ""}`,
  }));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">ההזמנות שלי</h1>
      <CalendarSyncLink icsToken={profile.ics_token} />
      <BookingsClient
        bookings={bookingsWithRoom}
        cancelWindowHours={setting("cancel_window_hours", 24)}
        horizonDays={setting("booking_horizon_days", 30)}
        roomOptions={roomOptions}
      />
    </div>
  );
}
