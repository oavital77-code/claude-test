import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { TIMEZONE } from "@/lib/time";
import { formatCurrency } from "@/lib/format";
import { dayBoundaries, todayInIsrael } from "@/lib/availability/grid";
import { Card, CardContent } from "@/components/ui/card";

export type TodayView = "bookings" | "purchases";

const hhmm = (iso: string) => formatInTimeZone(new Date(iso), TIMEZONE, "HH:mm");

/**
 * פירוט ברור של הנתונים שמאחורי כרטיסי הדשבורד ("שיבוצים חדשים היום" /
 * "רכישות היום") — אותן בדיוק השאילתות, כך שהמספר בדשבורד = מספר השורות כאן.
 */
export async function TodayDetails({ view }: { view: TodayView }) {
  const supabase = await createClient();
  const { start, end } = dayBoundaries(todayInIsrael());
  const todayStart = start.toISOString();
  const todayEnd = end.toISOString();

  if (view === "bookings") {
    const [{ data: bookings }, { data: rooms }, { data: branches }] = await Promise.all([
      supabase
        .from("bookings")
        .select("id, user_id, room_id, starts_at, ends_at, hours_charged, created_at")
        .eq("status", "confirmed")
        .eq("source", "punch_card")
        .is("admin_note", null)
        .gte("created_at", todayStart)
        .lt("created_at", todayEnd)
        .order("created_at", { ascending: false }),
      supabase.from("rooms").select("id, name, branch_id"),
      supabase.from("branches").select("id, name"),
    ]);
    const names = await profileNames((bookings ?? []).map((b) => b.user_id));
    const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
    const roomLabel = new Map(
      (rooms ?? []).map((r) => [r.id, `${branchName.get(r.branch_id) ?? ""} · ${r.name}`]),
    );
    const totalHours = (bookings ?? []).reduce((sum, b) => sum + Number(b.hours_charged), 0);

    return (
      <DetailsCard
        title="שיבוצים חדשים היום"
        summary={`${(bookings ?? []).length} שיבוצים · ${totalHours} ש׳ מכרטיסייה · שמטפלים קבעו בעצמם`}
        headers={["נקבע ב-", "מטפל/ת", "חדר", "מועד השיבוץ", "שעות"]}
        rows={(bookings ?? []).map((b) => [
          hhmm(b.created_at),
          names.get(b.user_id) ?? "—",
          roomLabel.get(b.room_id) ?? "—",
          `${formatInTimeZone(new Date(b.starts_at), TIMEZONE, "dd/MM")} · ${hhmm(b.starts_at)}–${hhmm(b.ends_at)}`,
          String(Number(b.hours_charged)),
        ])}
        empty="אין שיבוצים חדשים היום."
      />
    );
  }

  const { data: payments } = await supabase
    .from("payments")
    .select("id, user_id, type, amount_total, paid_at, punch_card_id")
    .eq("status", "paid")
    .gt("amount_total", 0)
    .gte("paid_at", todayStart)
    .lt("paid_at", todayEnd)
    .order("paid_at", { ascending: false });
  const cardIds = (payments ?? []).map((p) => p.punch_card_id).filter((id): id is string => !!id);
  const [names, { data: cards }] = await Promise.all([
    profileNames((payments ?? []).map((p) => p.user_id)),
    cardIds.length
      ? supabase.from("punch_cards").select("id, hours_purchased").in("id", cardIds)
      : Promise.resolve({ data: [] as { id: string; hours_purchased: number }[] }),
  ]);
  const hoursByCard = new Map((cards ?? []).map((c) => [c.id, Number(c.hours_purchased)]));
  const total = (payments ?? []).reduce((sum, p) => sum + Number(p.amount_total), 0);

  return (
    <DetailsCard
      title="רכישות היום"
      summary={`${(payments ?? []).length} רכישות · סה״כ ${formatCurrency(total)} (כולל מע״מ)`}
      headers={["שעה", "מטפל/ת", "מה נרכש", "סכום"]}
      rows={(payments ?? []).map((p) => [
        p.paid_at ? hhmm(p.paid_at) : "—",
        names.get(p.user_id) ?? "—",
        p.type === "punch_card"
          ? `כרטיסייה ${p.punch_card_id && hoursByCard.has(p.punch_card_id) ? `${hoursByCard.get(p.punch_card_id)} ש׳` : ""}`.trim()
          : "ססיה",
        formatCurrency(Number(p.amount_total)),
      ])}
      empty="אין רכישות היום."
    />
  );
}

async function profileNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

function DetailsCard({
  title,
  summary,
  headers,
  rows,
  empty,
}: {
  title: string;
  summary: string;
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{summary}</p>
          </div>
          <Link href="/admin/audit" className="text-sm text-primary hover:underline">
            ליומן המלא ←
          </Link>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="whitespace-nowrap p-2 text-right font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t">
                    {row.map((cell, j) => (
                      <td key={j} className="whitespace-nowrap p-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
