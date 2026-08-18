import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { AdminPaymentsClient, type PaymentRow } from "./payments-client";

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  const userIds = [...new Set((payments ?? []).map((p) => p.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const rows: PaymentRow[] = (payments ?? []).map((p) => ({
    ...p,
    therapistName: nameById.get(p.user_id) ?? "",
  }));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">תשלומים</h1>
      <AdminPaymentsClient rows={rows} />
    </div>
  );
}
