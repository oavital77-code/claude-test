import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { CANCELLATION_ACTIONS, cancellationDetails, type CancelledBooking } from "@/lib/audit-cancellation";
import { AdminAuditClient, type AuditRow } from "./audit-client";
import { TodayDetails, type TodayView } from "./today-details";

// יומן הפעולות של המערכת. הטבלה נכתבת ע"י ה-RPC-ים עצמם (בתוך אותה
// טרנזקציה של הפעולה), כך שכל שורה כאן משקפת פעולה שבאמת בוצעה — לא ניסיון.
// חשיפה: admin_read_audit ב-RLS (ר' 20260818000002_rls.sql).
function detailString(details: unknown, key: string): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const value = (details as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireAdmin();
  const { view: rawView } = await searchParams;
  // ?view= מגיע מכרטיסי הדשבורד — פירוט ברור של הנתון מעל היומן המלא.
  const view: TodayView | null = rawView === "bookings" || rawView === "purchases" ? rawView : null;
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  // ביטול: ה-RPC רושם רק hours_refunded — החדר, המועד והשעות מההזמנה עצמה.
  const cancelledIds = [
    ...new Set(
      (entries ?? [])
        .filter((e) => CANCELLATION_ACTIONS.has(e.action) && e.entity_id)
        .map((e) => e.entity_id as string),
    ),
  ];
  const { data: cancelledBookings } = cancelledIds.length
    ? await supabase
        .from("bookings")
        .select("id, user_id, room_id, source, starts_at, ends_at, hours_charged, hours_refunded")
        .in("id", cancelledIds)
    : { data: [] as (CancelledBooking & { id: string })[] };
  const cancelledById = new Map((cancelledBookings ?? []).map((b) => [b.id, b]));

  // גם user_id שבתוך הפרטים (after) — כדי להציג שם במקום מזהה.
  const detailUserIds = [
    ...(entries ?? []).map((e) => detailString(e.after, "user_id")),
    ...(cancelledBookings ?? []).map((b) => b.user_id),
  ];
  const actorIds = [
    ...new Set(
      [...(entries ?? []).map((e) => e.actor_id), ...detailUserIds].filter((id): id is string => !!id),
    ),
  ];
  const [{ data: profiles }, { data: rooms }] = await Promise.all([
    actorIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", actorIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    supabase.from("rooms").select("id, name"),
  ]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const lookups = {
    names: Object.fromEntries(nameById),
    rooms: Object.fromEntries((rooms ?? []).map((r) => [r.id, r.name])),
  };

  const rows: AuditRow[] = (entries ?? []).map((e) => {
    const cancelled =
      CANCELLATION_ACTIONS.has(e.action) && e.entity_id ? cancelledById.get(e.entity_id) : undefined;
    return {
      id: e.id,
      action: e.action,
      entity: e.entity,
      entityId: e.entity_id,
      createdAt: e.created_at,
      // actor_id ריק = פעולה שבוצעה ע"י המערכת עצמה (cron, קליטת תשלום מהחנות).
      actorName: e.actor_id ? (nameById.get(e.actor_id) ?? "משתמש שנמחק") : "מערכת",
      details: cancelled
        ? cancellationDetails(cancelled, e.action === "booking_cancelled_by_admin")
        : e.after,
    };
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">יומן פעולות</h1>
        <p className="text-sm text-muted-foreground">
          500 הפעולות האחרונות במערכת. כל הזמנה, ביטול, תשלום והתערבות ידנית נרשמים כאן אוטומטית.
        </p>
      </div>
      {view && <TodayDetails view={view} />}
      <AdminAuditClient rows={rows} lookups={lookups} />
    </div>
  );
}
