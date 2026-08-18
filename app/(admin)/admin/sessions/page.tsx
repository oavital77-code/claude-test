import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { AdminSessionsClient, type AdminSubscriptionRow } from "./admin-sessions-client";

export default async function AdminSessionsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: subscriptions } = await supabase
    .from("session_subscriptions")
    .select("*")
    .in("status", ["requested", "awaiting_payment", "active"])
    .order("requested_at", { ascending: true });

  const subIds = (subscriptions ?? []).map((s) => s.id);
  const userIds = [...new Set((subscriptions ?? []).map((s) => s.user_id))];

  const [{ data: slots }, { data: profiles }] = await Promise.all([
    subIds.length
      ? supabase.from("session_slots").select("*").in("subscription_id", subIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from("profiles").select("id, full_name, phone").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  const roomIds = [...new Set((slots ?? []).map((s) => s.room_id))];
  const { data: rooms } = roomIds.length
    ? await supabase.from("rooms").select("id, name").in("id", roomIds)
    : { data: [] };

  const roomNameById = new Map((rooms ?? []).map((r) => [r.id, r.name]));
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const rows: AdminSubscriptionRow[] = (subscriptions ?? []).map((sub) => ({
    ...sub,
    therapistName: profileById.get(sub.user_id)?.full_name ?? "",
    therapistPhone: profileById.get(sub.user_id)?.phone ?? "",
    slots: (slots ?? [])
      .filter((s) => s.subscription_id === sub.id)
      .map((s) => ({ ...s, roomName: roomNameById.get(s.room_id) ?? "" })),
  }));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">בקשות ססיה</h1>
      <AdminSessionsClient rows={rows} />
    </div>
  );
}
