import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { RoomsAdminClient } from "./rooms-admin-client";

export default async function AdminRoomsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: branches }, { data: rooms }] = await Promise.all([
    supabase.from("branches").select("*").order("sort_order"),
    supabase.from("rooms").select("*").order("sort_order"),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">סניפים וחדרים</h1>
      <RoomsAdminClient branches={branches ?? []} rooms={rooms ?? []} />
    </div>
  );
}
