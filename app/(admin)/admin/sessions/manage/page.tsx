import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { dayBoundaries, todayInIsrael, addDaysToDateStr } from "@/lib/availability/grid";
import { ManageSessionsClient, type ManagedTherapist } from "./manage-sessions-client";

// כמה שבועות קדימה להציג "מפגשים קרובים" לכל ססיה.
const UPCOMING_WEEKS = 8;

export default async function ManageSessionsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const today = todayInIsrael();

  const [{ data: subs }, { data: rooms }, { data: branches }, { data: therapists }] = await Promise.all([
    supabase
      .from("session_subscriptions")
      .select("id, user_id, status, weekly_hours, monthly_price, start_date, effective_end_date")
      .in("status", ["active", "pending_cancellation"])
      .order("start_date", { ascending: true }),
    supabase.from("rooms").select("id, name, branch_id").eq("active", true).order("sort_order"),
    supabase.from("branches").select("id, name"),
    supabase.from("profiles").select("id, full_name, phone").eq("role", "therapist").order("full_name"),
  ]);

  const subIds = (subs ?? []).map((s) => s.id);
  const [{ data: slots }, { data: bookings }] = await Promise.all([
    subIds.length
      ? supabase.from("session_slots").select("*").in("subscription_id", subIds)
      : Promise.resolve({ data: [] }),
    subIds.length
      ? supabase
          .from("bookings")
          .select("id, subscription_id, room_id, starts_at, ends_at, admin_note")
          .in("subscription_id", subIds)
          .eq("status", "confirmed")
          .gte("starts_at", dayBoundaries(today).start.toISOString())
          .lt("starts_at", dayBoundaries(addDaysToDateStr(today, UPCOMING_WEEKS * 7)).start.toISOString())
          .order("starts_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const roomOptions = (rooms ?? []).map((r) => ({ id: r.id, name: `${r.name} · ${branchName.get(r.branch_id) ?? ""}` }));
  const nameById = new Map((therapists ?? []).map((t) => [t.id, t.full_name]));

  const grouped = new Map<string, ManagedTherapist>();
  // ססיה שתאריך הסיום שלה כבר עבר — היסטוריה, לא לניהול.
  for (const s of (subs ?? []).filter((x) => !x.effective_end_date || x.effective_end_date >= today)) {
    const entry = grouped.get(s.user_id) ?? { userId: s.user_id, name: nameById.get(s.user_id) ?? "—", subscriptions: [] };
    entry.subscriptions.push({
      ...s,
      // משבצות שהסתיימו לפני היום לא מעניינות כאן — הן נשארות רק כהיסטוריה.
      slots: (slots ?? [])
        .filter((sl) => sl.subscription_id === s.id && (!sl.valid_until || sl.valid_until >= today))
        .filter((sl) => !sl.valid_until || !sl.valid_from || sl.valid_from <= sl.valid_until)
        .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)),
      upcoming: (bookings ?? []).filter((b) => b.subscription_id === s.id),
    });
    grouped.set(s.user_id, entry);
  }
  const managed = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, "he"));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">ניהול ססיות</h1>
        <p className="text-sm text-muted-foreground">
          כל שינוי חל מהתאריך שבוחרים והלאה — מה שלפניו נשאר כמו שהוא. בלי מיילים ובלי חיוב.
        </p>
      </div>
      <ManageSessionsClient
        therapists={managed}
        roomOptions={roomOptions}
        allTherapists={(therapists ?? []).map((t) => ({ id: t.id, name: t.full_name, phone: t.phone }))}
        today={today}
      />
    </div>
  );
}
