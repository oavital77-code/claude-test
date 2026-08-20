import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { TherapistsClient } from "./therapists-client";

export default async function AdminTherapistsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: therapists } = await supabase
    .from("profiles")
    .select("id, full_name, phone, email, status, created_at")
    .eq("role", "therapist")
    .order("full_name");

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">מטפלים</h1>
      <TherapistsClient therapists={therapists ?? []} />
    </div>
  );
}
