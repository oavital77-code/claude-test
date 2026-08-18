import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
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

  const [{ data: punchCards }, { data: bookings }, { data: payments }, { data: subscriptions }] =
    await Promise.all([
      supabase.from("punch_cards").select("*").eq("user_id", id).order("purchased_at", { ascending: false }),
      supabase
        .from("bookings")
        .select("id, room_id, starts_at, ends_at, source, status")
        .eq("user_id", id)
        .order("starts_at", { ascending: false })
        .limit(20),
      supabase.from("payments").select("*").eq("user_id", id).order("created_at", { ascending: false }),
      supabase.from("session_subscriptions").select("*").eq("user_id", id).order("created_at", { ascending: false }),
    ]);

  const roomIds = [...new Set((bookings ?? []).map((b) => b.room_id))];
  const { data: rooms } = roomIds.length
    ? await supabase.from("rooms").select("id, name").in("id", roomIds)
    : { data: [] };
  const roomNameById = new Map((rooms ?? []).map((r) => [r.id, r.name]));

  const bookingsWithRoom = (bookings ?? []).map((b) => ({ ...b, roomName: roomNameById.get(b.room_id) ?? "" }));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{profile.full_name}</h1>
      <TherapistDetailClient
        profile={profile}
        punchCards={punchCards ?? []}
        bookings={bookingsWithRoom}
        payments={payments ?? []}
        subscriptions={subscriptions ?? []}
      />
    </div>
  );
}
