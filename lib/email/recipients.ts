import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export async function getAdminEmails(client: SupabaseClient<Database>): Promise<string[]> {
  const { data } = await client.from("profiles").select("email").eq("role", "admin");
  return (data ?? []).map((p) => p.email);
}
