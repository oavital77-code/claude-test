import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { groupSkeddaBlocks, IMPORT_MARKERS } from "@/lib/skedda-import/group";
import { lookupSkeddaRoster } from "@/lib/skedda-import/roster";
import { TherapistDetailClient } from "./therapist-detail-client";
import { PendingPurchasesSection, type PendingPurchase } from "./pending-purchases-section";

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
    { data: pendingRows },
    { data: tiers },
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
      // חסימות שממתינות לשיוך — בין אם יובאו מ-Skedda ובין אם מקובץ
      // CSV/אקסל דרך מסך ההגדרות. אותו תהליך קליטה בדיוק.
      .or(IMPORT_MARKERS.map((marker) => `reason.ilike.%${marker}%`).join(","))
      .order("starts_at", { ascending: true }),
    // רכישות Woo שלא נמשכו אוטומטית (אין חשבון עם אותו מייל) — לשיוך ידני.
    supabase
      .from("woo_pending_purchases")
      .select("id, woo_order_id, email, phone, tier_id, quantity, amount_total, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase.from("punch_card_tiers").select("id, hours"),
  ]);

  const roomIds = [...new Set((bookings ?? []).map((b) => b.room_id))];
  const { data: rooms } = roomIds.length
    ? await supabase.from("rooms").select("id, name").in("id", roomIds)
    : { data: [] };
  const roomNameById = new Map((rooms ?? []).map((r) => [r.id, r.name]));

  const bookingsWithRoom = (bookings ?? []).map((b) => ({ ...b, roomName: roomNameById.get(b.room_id) ?? "" }));
  const skeddaGroups = groupSkeddaBlocks(skeddaBlocks ?? []);
  const skeddaRosterMatch = lookupSkeddaRoster(profile.phone);

  const tierHoursById = new Map((tiers ?? []).map((t) => [t.id, t.hours]));
  const pendingPurchases: PendingPurchase[] = (pendingRows ?? []).map((p) => ({
    id: p.id,
    wooOrderId: p.woo_order_id,
    email: p.email,
    phone: p.phone,
    hours: (tierHoursById.get(p.tier_id) ?? 0) * p.quantity,
    amountTotal: p.amount_total,
    createdAt: p.created_at,
  }));

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
        skeddaRosterMatch={skeddaRosterMatch}
      />
      <PendingPurchasesSection
        userId={profile.id}
        therapistName={profile.full_name}
        therapistEmail={profile.email}
        purchases={pendingPurchases}
      />
    </div>
  );
}
