import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { BookingsClient, type BookingWithRoom } from "./bookings-client";

export default async function BookingsPage() {
  const { userId } = await requireTherapistProfile();
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

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">ההזמנות שלי</h1>
      <BookingsClient bookings={bookingsWithRoom} />
    </div>
  );
}
