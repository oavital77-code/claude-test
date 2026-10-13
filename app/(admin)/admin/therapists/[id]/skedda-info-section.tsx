import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateHe } from "@/lib/time";
import type { Database } from "@/lib/supabase/types";

type SkeddaRow = Database["public"]["Tables"]["skedda_migration"]["Row"];

/**
 * מה הועבר מ-Skedda למטפל/ת הזה/ו (טבלת skedda_migration): יתרה, מוצר,
 * ופרטי ססיה לקליטה. הקליטה עצמה של הססיה — בסקשן "קליטה מ-Skedda" למטה.
 */
export function SkeddaInfoSection({ rows }: { rows: SkeddaRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">הועבר מ-Skedda</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-col gap-1">
            <span>
              מוצר ב-Skedda: {r.skedda_product ?? "—"} · נוצלו {r.used_hours ?? 0} ש׳
            </span>
            <span>
              יתרה מ-Skedda:{" "}
              {r.balance_hours === null ? "לא ידועה" : `${r.balance_hours} ש׳`}
              {r.status === "transferred" &&
                ` · ✓ הועברה לכרטיסייה${r.claimed_at ? ` (${formatDateHe(new Date(r.claimed_at))})` : ""}`}
              {r.status === "pending" && " · טרם הועברה"}
              {r.status === "skipped" && " · דולג"}
            </span>
            {r.has_session && (
              <span>
                <b>ססיה:</b> {r.session_details ?? "אין פרטים"}
                {r.session_paid_until && ` · שולם עד ${formatDateHe(new Date(r.session_paid_until))}`}
                {r.session_commitment && ` · התחייבות: ${r.session_commitment}`}
                <br />
                <span className="text-muted-foreground">
                  המשבצות שמורות בלוח. קליטת הססיה — בסקשן &quot;קליטה מ-Skedda&quot; בכרטיס הזה.
                </span>
              </span>
            )}
            {r.note && <span className="text-muted-foreground">{r.note}</span>}
            {r.admin_note && <span>הערה: {r.admin_note}</span>}
          </div>
        ))}
        <Link href="/admin/therapists/skedda" className="text-violet-600 hover:underline">
          עריכה במסך ההעברה מ-Skedda
        </Link>
      </CardContent>
    </Card>
  );
}
