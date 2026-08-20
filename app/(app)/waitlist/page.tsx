import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { WaitlistClient, type WaitlistRow } from "./waitlist-client";

export default async function WaitlistPage() {
  const { userId } = await requireTherapistProfile();
  const supabase = await createClient();

  const [{ data: branches }, { data: rooms }, { data: entries }] = await Promise.all([
    supabase.from("branches").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("rooms").select("id, name, branch_id").eq("active", true).order("sort_order"),
    supabase
      .from("waitlist")
      .select("*")
      .eq("user_id", userId)
      .eq("fulfilled", false)
      .order("date"),
  ]);

  const roomNameById = new Map((rooms ?? []).map((r) => [r.id, r.name]));
  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));

  const rows: WaitlistRow[] = (entries ?? []).map((e) => ({
    ...e,
    roomName: e.room_id ? (roomNameById.get(e.room_id) ?? "") : "כל חדר",
    branchName: branchNameById.get(e.branch_id ?? "") ?? "",
  }));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">רשימת המתנה</h1>
      <p className="text-sm text-muted-foreground">
        נבקש ממך תודיע כשמשבצת שביקשת מתפנה — כל הקודם זוכה.
      </p>
      <WaitlistClient branches={branches ?? []} rooms={rooms ?? []} entries={rows} />
    </div>
  );
}
