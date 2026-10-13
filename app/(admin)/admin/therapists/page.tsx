import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { TherapistsClient } from "./therapists-client";

/** יום ההשקה (14/10/2026, 00:00 שעון ישראל). */
const LAUNCH_AT_MS = new Date("2026-10-14T00:00:00+03:00").getTime();

export default async function AdminTherapistsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: therapists }, { data: cards }, { data: skeddaRows }, { data: allEmails }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone, email, status, created_at")
      .eq("role", "therapist")
      .order("full_name"),
    supabase
      .from("punch_cards")
      .select("user_id, hours_remaining, hours_purchased, purchased_at, tier_id")
      .eq("active", true)
      .gt("expires_at", new Date().toISOString()),
    // מטפלים מ-Skedda שעוד לא נרשמו — מוצגים ברשימה עם "טרם נרשם/ה" עד שיירשמו.
    supabase
      .from("skedda_migration")
      .select("id, full_name, email, phone, balance_hours, has_session")
      .eq("status", "pending")
      .order("full_name"),
    supabase.from("profiles").select("email"),
  ]);

  // יתרת השעות (סכום כל הכרטיסיות הפעילות של כל מטפל, יכולה להיות במינוס) —
  // כדי להציג ברשימה עצמה כמה נשאר בלי להיכנס לכרטיס שלו.
  const hoursByUser = new Map<string, number>();
  // כרטיסיות שנרכשו מיום ההשקה — מוצגות ברשימה עם "נרכשו/נוצלו". כרטיסיות
  // ההעברה מ-Skedda (בלי tier) ומה שנרכש לפני ההשקה מוצגות כיתרה בלבד.
  const newCardsByUser = new Map<string, { purchased: number; used: number }[]>();
  for (const c of cards ?? []) {
    hoursByUser.set(c.user_id, (hoursByUser.get(c.user_id) ?? 0) + c.hours_remaining);
    if (c.tier_id && new Date(c.purchased_at).getTime() >= LAUNCH_AT_MS) {
      const list = newCardsByUser.get(c.user_id) ?? [];
      list.push({ purchased: c.hours_purchased, used: c.hours_purchased - c.hours_remaining });
      newCardsByUser.set(c.user_id, list);
    }
  }
  const therapistsWithHours = (therapists ?? []).map((t) => ({
    ...t,
    hoursRemaining: hoursByUser.get(t.id) ?? 0,
    hasCard: hoursByUser.has(t.id),
    newCards: newCardsByUser.get(t.id) ?? [],
  }));

  const registered = new Set((allEmails ?? []).map((p) => p.email.toLowerCase()));
  const pendingSkedda = (skeddaRows ?? []).filter((r) => !r.email || !registered.has(r.email.toLowerCase()));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">מטפלים</h1>
        <Link href="/admin/therapists/skedda" className="text-sm font-semibold text-violet-600 hover:underline">
          העברה מ-Skedda: יתרות וססיות ←
        </Link>
      </div>
      <TherapistsClient therapists={therapistsWithHours} pendingSkedda={pendingSkedda} />
    </div>
  );
}
