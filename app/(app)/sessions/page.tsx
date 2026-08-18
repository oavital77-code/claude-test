import Link from "next/link";
import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { SessionsClient, type SubscriptionWithSlots } from "./sessions-client";

export default async function SessionsPage() {
  const { userId } = await requireTherapistProfile();
  const supabase = await createClient();

  const { data: subscriptions } = await supabase
    .from("session_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const subIds = (subscriptions ?? []).map((s) => s.id);
  const { data: slots } = subIds.length
    ? await supabase.from("session_slots").select("*").in("subscription_id", subIds)
    : { data: [] };

  const roomIds = [...new Set((slots ?? []).map((s) => s.room_id))];
  const { data: rooms } = roomIds.length
    ? await supabase.from("rooms").select("id, name").in("id", roomIds)
    : { data: [] };
  const roomNameById = new Map((rooms ?? []).map((r) => [r.id, r.name]));

  const subscriptionsWithSlots: SubscriptionWithSlots[] = (subscriptions ?? []).map((sub) => ({
    ...sub,
    slots: (slots ?? [])
      .filter((s) => s.subscription_id === sub.id)
      .map((s) => ({ ...s, roomName: roomNameById.get(s.room_id) ?? "" })),
  }));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">הססיות שלי</h1>
        <Button asChild size="sm">
          <Link href="/sessions/new">בקשת ססיה חדשה</Link>
        </Button>
      </div>
      <SessionsClient subscriptions={subscriptionsWithSlots} />
    </div>
  );
}
