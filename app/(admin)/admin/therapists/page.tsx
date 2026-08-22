import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { TherapistsClient } from "./therapists-client";

export default async function AdminTherapistsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: therapists }, { data: cards }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone, email, status, created_at")
      .eq("role", "therapist")
      .order("full_name"),
    supabase
      .from("punch_cards")
      .select("user_id, hours_remaining, hours_purchased")
      .eq("active", true)
      .gt("expires_at", new Date().toISOString()),
  ]);

  // סכום שעות (נותרו/נרכשו) על פני כל הכרטיסיות הפעילות של כל מטפל —
  // כדי להציג ברשימה עצמה "כמה נשאר מתוך כמה נרכש" בלי להיכנס לכרטיס שלו.
  const hoursByUser = new Map<string, { remaining: number; purchased: number }>();
  for (const c of cards ?? []) {
    const cur = hoursByUser.get(c.user_id) ?? { remaining: 0, purchased: 0 };
    cur.remaining += c.hours_remaining;
    cur.purchased += c.hours_purchased;
    hoursByUser.set(c.user_id, cur);
  }
  const therapistsWithHours = (therapists ?? []).map((t) => ({
    ...t,
    hoursRemaining: hoursByUser.get(t.id)?.remaining ?? 0,
    hoursPurchased: hoursByUser.get(t.id)?.purchased ?? 0,
  }));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">מטפלים</h1>
      <TherapistsClient therapists={therapistsWithHours} />
    </div>
  );
}
