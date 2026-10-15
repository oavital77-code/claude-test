import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { TherapistsClient } from "./therapists-client";

/** יום ההשקה (14/10/2026, 00:00 שעון ישראל). */
const LAUNCH_AT_MS = new Date("2026-10-14T00:00:00+03:00").getTime();

export default async function AdminTherapistsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [
    { data: therapists },
    { data: cards },
    { data: skeddaRows },
    { data: allEmails },
    { data: activeSessions },
    { data: skeddaSessionRows },
    { data: futureCharged },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone, email, status, created_at")
      .eq("role", "therapist")
      .order("full_name"),
    supabase
      .from("punch_cards")
      .select("id, user_id, hours_remaining, hours_purchased, purchased_at, tier_id")
      .eq("active", true)
      .gt("expires_at", new Date().toISOString()),
    // מטפלים מ-Skedda שעוד לא נרשמו — מוצגים ברשימה עם "טרם נרשם/ה" עד שיירשמו.
    supabase
      .from("skedda_migration")
      .select("id, full_name, email, phone, balance_hours, has_session")
      .eq("status", "pending")
      .order("full_name"),
    supabase.from("profiles").select("email"),
    supabase
      .from("session_subscriptions")
      .select("user_id")
      .in("status", ["active", "pending_cancellation"]),
    // ססיה שעדיין רשומה רק כחסימת Skedda (טרם הוגדרה כססיה אמיתית במערכת).
    supabase.from("skedda_migration").select("email, claimed_by").eq("has_session", true),
    // שיבוצים עתידיים שכבר קוזזו מכרטיסייה — השעות ירדו ביצירה, לא בפועל.
    supabase
      .from("bookings")
      .select("punch_card_id, hours_charged")
      .eq("status", "confirmed")
      .gt("starts_at", new Date().toISOString())
      .not("punch_card_id", "is", null)
      .gt("hours_charged", 0)
      .limit(10000),
  ]);

  const sessionUserIds = new Set((activeSessions ?? []).map((s) => s.user_id));
  const skeddaSessionKeys = new Set(
    (skeddaSessionRows ?? []).flatMap((r) => [r.claimed_by, r.email?.toLowerCase()].filter((k): k is string => !!k)),
  );
  const sessionStatusOf = (t: { id: string; email: string }): "active" | "skedda" | null =>
    sessionUserIds.has(t.id)
      ? "active"
      : skeddaSessionKeys.has(t.id) || skeddaSessionKeys.has(t.email.toLowerCase())
        ? "skedda"
        : null;

  // יתרת השעות (סכום כל הכרטיסיות הפעילות של כל מטפל, יכולה להיות במינוס) —
  // כדי להציג ברשימה עצמה כמה נשאר בלי להיכנס לכרטיס שלו.
  const hoursByUser = new Map<string, number>();
  // כרטיסיות שנרכשו מיום ההשקה — מוצגות ברשימה עם "נרכשו/נוצלו". כרטיסיות
  // ההעברה מ-Skedda (בלי tier) ומה שנרכש לפני ההשקה מוצגות כיתרה בלבד.
  const newCardsByUser = new Map<string, { purchased: number; used: number }[]>();
  const futureByCard = new Map<string, number>();
  for (const b of futureCharged ?? []) {
    futureByCard.set(b.punch_card_id!, (futureByCard.get(b.punch_card_id!) ?? 0) + Number(b.hours_charged));
  }
  // שעות של שיבוצים עתידיים (רק בכרטיסיות שמוצגות ביתרה) — "נכון להיום" = יתרה + שעות אלה.
  const futureByUser = new Map<string, number>();
  for (const c of cards ?? []) {
    hoursByUser.set(c.user_id, (hoursByUser.get(c.user_id) ?? 0) + c.hours_remaining);
    const future = futureByCard.get(c.id) ?? 0;
    if (future) futureByUser.set(c.user_id, (futureByUser.get(c.user_id) ?? 0) + future);
    if (c.tier_id && new Date(c.purchased_at).getTime() >= LAUNCH_AT_MS) {
      const list = newCardsByUser.get(c.user_id) ?? [];
      list.push({ purchased: c.hours_purchased, used: c.hours_purchased - c.hours_remaining });
      newCardsByUser.set(c.user_id, list);
    }
  }
  const therapistsWithHours = (therapists ?? []).map((t) => ({
    ...t,
    hoursRemaining: hoursByUser.get(t.id) ?? 0,
    futureHours: futureByUser.get(t.id) ?? 0,
    hasCard: hoursByUser.has(t.id),
    newCards: newCardsByUser.get(t.id) ?? [],
    session: sessionStatusOf(t),
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
