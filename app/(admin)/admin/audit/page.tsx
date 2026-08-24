import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { AdminAuditClient, type AuditRow } from "./audit-client";

// יומן הפעולות של המערכת. הטבלה נכתבת ע"י ה-RPC-ים עצמם (בתוך אותה
// טרנזקציה של הפעולה), כך שכל שורה כאן משקפת פעולה שבאמת בוצעה — לא ניסיון.
// חשיפה: admin_read_audit ב-RLS (ר' 20260818000002_rls.sql).
export default async function AdminAuditPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  const actorIds = [...new Set((entries ?? []).map((e) => e.actor_id).filter((id): id is string => !!id))];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const rows: AuditRow[] = (entries ?? []).map((e) => ({
    id: e.id,
    action: e.action,
    entity: e.entity,
    entityId: e.entity_id,
    createdAt: e.created_at,
    // actor_id ריק = פעולה שבוצעה ע"י המערכת עצמה (cron, קליטת תשלום מהחנות).
    actorName: e.actor_id ? (nameById.get(e.actor_id) ?? "משתמש שנמחק") : "מערכת",
    details: e.after,
  }));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">יומן פעולות</h1>
        <p className="text-sm text-muted-foreground">
          500 הפעולות האחרונות במערכת. כל הזמנה, ביטול, תשלום והתערבות ידנית נרשמים כאן אוטומטית.
        </p>
      </div>
      <AdminAuditClient rows={rows} />
    </div>
  );
}
