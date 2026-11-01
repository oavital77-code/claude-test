import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/time";
import { Card, CardContent } from "@/components/ui/card";
import { OUTBOUND_LINKS } from "@/lib/outbound-links";

type Stat = {
  link: string;
  total: number;
  last_7_days: number;
  last_30_days: number;
  unique_users: number;
  last_click_at: string | null;
};

// לחיצות על קישורים יוצאים (Cleana+ והבאנרים) — מ-admin_link_click_stats.
// כל קישור מוצג גם כשאין עדיין לחיצות (0), כדי שיהיה ברור שהמדידה פעילה.
export function LinkClicksCard({ stats }: { stats: Stat[] }) {
  const byKey = new Map(stats.map((s) => [s.link, s]));
  const rows = Object.values(OUTBOUND_LINKS).map((l) => ({ label: l.label, s: byKey.get(l.key) }));
  const n = (v: number | undefined) => (v ?? 0).toLocaleString("he-IL");

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-semibold">לחיצות על קישורים</h2>
          <p className="text-xs text-muted-foreground">
            קישור Cleana+ בסרגל הניווט ובאנרי PayPlus בממשק המטפלים. נספר מ-01/11/2026.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs text-muted-foreground">
                <th className="py-2 text-start font-medium">קישור</th>
                <th className="py-2 text-center font-medium">7 ימים</th>
                <th className="py-2 text-center font-medium">30 יום</th>
                <th className="py-2 text-center font-medium">סה״כ</th>
                <th className="py-2 text-center font-medium">מטפלים שונים</th>
                <th className="py-2 text-start font-medium">לחיצה אחרונה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ label, s }) => (
                <tr key={label} className="border-b border-border last:border-0">
                  <td className="py-2.5 font-medium">{label}</td>
                  <td className="py-2.5 text-center tabular-nums">{n(s?.last_7_days)}</td>
                  <td className="py-2.5 text-center tabular-nums">{n(s?.last_30_days)}</td>
                  <td className="py-2.5 text-center font-semibold tabular-nums">{n(s?.total)}</td>
                  <td className="py-2.5 text-center tabular-nums">{n(s?.unique_users)}</td>
                  <td className="py-2.5 tabular-nums text-muted-foreground">
                    {s?.last_click_at ? formatInTimeZone(new Date(s.last_click_at), TIMEZONE, "dd/MM/yyyy HH:mm") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
