import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { SkeddaMigrationClient } from "./skedda-migration-client";

export default async function SkeddaMigrationPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: rows }, { data: profiles }, { data: flag }] = await Promise.all([
    supabase.from("skedda_migration").select("*").order("full_name"),
    supabase.from("profiles").select("email"),
    supabase.from("app_settings").select("value").eq("key", "skedda_balance_claim_enabled").maybeSingle(),
  ]);

  const registeredEmails = (profiles ?? []).map((p) => p.email.toLowerCase());

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">העברה מ-Skedda</h1>
        <Link href="/admin/therapists" className="text-sm text-violet-600 hover:underline">
          ← חזרה לרשימת המטפלים
        </Link>
      </div>
      <SkeddaMigrationClient
        rows={rows ?? []}
        registeredEmails={registeredEmails}
        claimEnabled={flag?.value === 1}
      />
    </div>
  );
}
