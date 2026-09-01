import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { AdminSessionsClient, type AdminSubscriptionRow } from "./admin-sessions-client";

export default async function AdminSessionsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: subscriptions }, { data: termEnded }] = await Promise.all([
    supabase
      .from("session_subscriptions")
      .select("*")
      .in("status", ["requested", "awaiting_payment", "active"])
      .order("requested_at", { ascending: true }),
    // ססיות עם טווח התחייבות (§ קליטה מ-Skedda / אישור בקשה) שהגיע סופו —
    // ר' 20260901000002_session_commitment_term.sql. status יכול להיות גם
    // 'expired' אם גם החיוב החודשי הרגיל לא חודש באותו זמן בערך.
    supabase
      .from("session_subscriptions")
      .select("*")
      .in("status", ["active", "expired"])
      .not("effective_end_date", "is", null)
      .lte("effective_end_date", today)
      .order("effective_end_date", { ascending: true }),
  ]);

  const allSubs = [...(subscriptions ?? []), ...(termEnded ?? [])];
  const subIds = allSubs.map((s) => s.id);
  const userIds = [...new Set(allSubs.map((s) => s.user_id))];

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

  function toRow(sub: (typeof allSubs)[number]): AdminSubscriptionRow {
    return {
      ...sub,
      therapistName: profileById.get(sub.user_id)?.full_name ?? "",
      therapistPhone: profileById.get(sub.user_id)?.phone ?? "",
      slots: (slots ?? [])
        .filter((s) => s.subscription_id === sub.id)
        .map((s) => ({ ...s, roomName: roomNameById.get(s.room_id) ?? "" })),
    };
  }

  const rows = (subscriptions ?? []).map(toRow);
  const termEndedRows = (termEnded ?? []).map(toRow);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">בקשות ססיה</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/sessions/new">קביעת ססיה חופשית</Link>
        </Button>
      </div>
      <AdminSessionsClient rows={rows} termEndedRows={termEndedRows} />
    </div>
  );
}
