import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { groupSkeddaBlocks, SKEDDA_MARKER } from "@/lib/skedda-import/group";
import { TherapistDetailClient } from "./therapist-detail-client";

export default async function AdminTherapistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!profile) notFound();

  const [
    { data: punchCards },
    { data: bookings },
    { data: payments },
    { data: subscriptions },
    { data: notesRow },
    { data: activeRooms },
    { data: skeddaBlocks },
  ] = await Promise.all([
    supabase.from("punch_cards").select("*").eq("user_id", id).order("purchased_at", { ascending: false }),
    supabase
      .from("bookings")
      .select("id, room_id, starts_at, ends_at, source, status")
      .eq("user_id", id)
      .order("starts_at", { ascending: false })
      .limit(20),
    supabase.from("payments").select("*").eq("user_id", id).order("created_at", { ascending: false }),
    supabase.from("session_subscriptions").select("*").eq("user_id", id).order("created_at", { ascending: false }),
    supabase.from("therapist_admin_notes").select("note").eq("user_id", id).maybeSingle(),
    supabase.from("rooms").select("id, name").eq("active", true).order("sort_order"),
    supabase
      .from("room_blocks")
      .select("id, room_id, starts_at, ends_at, reason")
      .ilike("reason", `%${SKEDDA_MARKER}%`)
      .order("starts_at", { ascending: true }),
  ]);

  const roomIds = [...new Set((bookings ?? []).map((b) => b.room_id))];
  const { data: rooms } = roomIds.length
    ? await supabase.from("rooms").select("id, name").in("id", roomIds)
    : { data: [] };
  const roomNameById = new Map((rooms ?? []).map((r) => [r.id, r.name]));

  const bookingsWithRoom = (bookings ?? []).map((b) => ({ ...b, roomName: roomNameById.get(b.room_id) ?? "" }));
  const skeddaGroups = groupSkeddaBlocks(skeddaBlocks ?? []);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{profile.full_name}</h1>
      <TherapistDetailClient
        profile={profile}
        adminNote={notesRow?.note ?? ""}
        punchCards={punchCards ?? []}
        bookings={bookingsWithRoom}
        payments={payments ?? []}
        subscriptions={subscriptions ?? []}
        roomOptions={activeRooms ?? []}
        skeddaGroups={skeddaGroups}
      />
    </div>
  );
}
