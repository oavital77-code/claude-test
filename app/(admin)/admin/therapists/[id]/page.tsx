import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { TherapistDetailClient } from "./therapist-detail-client";
import { PendingPurchasesSection, type PendingPurchase } from "./pending-purchases-section";
import { SkeddaInfoSection } from "./skedda-info-section";
import { CreditAllowanceSection } from "./credit-allowance-section";

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
    { data: pendingRows },
    { data: tiers },
    { data: skeddaRows },
    { data: branches },
    { data: creditAllowance },
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
    supabase.from("rooms").select("id, name, branch_id").eq("active", true).order("sort_order"),
    // רכישות Woo שלא נמשכו אוטומטית (אין חשבון עם אותו מייל) — לשיוך ידני.
    supabase
      .from("woo_pending_purchases")
      .select("id, woo_order_id, email, phone, tier_id, quantity, amount_total, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase.from("punch_card_tiers").select("id, hours"),
    supabase
      .from("skedda_migration")
      .select("*")
      // המייל במרכאות — PostgREST מפרש פסיקים/סוגריים בערך כחלק מהתחביר.
      .or(`claimed_by.eq.${id},email.eq."${profile.email.toLowerCase()}"`),
    supabase.from("branches").select("id, name"),
    supabase.from("therapist_credit_allowance").select("allowed").eq("user_id", id).maybeSingle(),
  ]);
  // "Room 1" קיים בשני הסניפים — בלי שם הסניף אי אפשר להבחין ביניהם ברשימות.
  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const roomLabel = (r: { name: string; branch_id: string }) =>
    `${r.name} · ${branchNameById.get(r.branch_id) ?? ""}`;
  const roomOptions = (activeRooms ?? []).map((r) => ({ id: r.id, name: roomLabel(r) }));

  const roomIds = [...new Set((bookings ?? []).map((b) => b.room_id))];
  const { data: rooms } = roomIds.length
    ? await supabase.from("rooms").select("id, name, branch_id").in("id", roomIds)
    : { data: [] };
  const roomNameById = new Map((rooms ?? []).map((r) => [r.id, roomLabel(r)]));

  const bookingsWithRoom = (bookings ?? []).map((b) => ({ ...b, roomName: roomNameById.get(b.room_id) ?? "" }));

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
      <SkeddaInfoSection rows={skeddaRows ?? []} />
      <CreditAllowanceSection userId={profile.id} allowed={creditAllowance?.allowed === true} />
      <TherapistDetailClient
        profile={profile}
        adminNote={notesRow?.note ?? ""}
        punchCards={punchCards ?? []}
        bookings={bookingsWithRoom}
        payments={payments ?? []}
        subscriptions={subscriptions ?? []}
        roomOptions={roomOptions}
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
