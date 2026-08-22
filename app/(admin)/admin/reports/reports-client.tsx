"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { toCsv, downloadCsv } from "@/lib/csv";
import type { Database } from "@/lib/supabase/types";

type SubStatus = Database["public"]["Tables"]["session_subscriptions"]["Row"]["status"];

const SUB_STATUS_LABELS: Record<SubStatus, string> = {
  requested: "ממתין לאישור הנהלה",
  awaiting_payment: "ממתין לתשלום",
  active: "פעיל",
  rejected: "נדחה",
  pending_cancellation: "בביטול",
  cancelled: "בוטל",
  expired: "פג תוקף",
};

export function ReportsClient({
  monthlyRevenue,
  occupancy,
  openBalances,
  inactiveTherapists,
  cardHoursByTherapist,
  sessionsByTherapist,
}: {
  monthlyRevenue: [string, number][];
  occupancy: { room: string; count: number }[];
  openBalances: { name: string; hours: number }[];
  inactiveTherapists: { name: string; phone: string }[];
  cardHoursByTherapist: { name: string; remaining: number; purchased: number }[];
  sessionsByTherapist: { name: string; status: SubStatus; weeklyHours: number; monthlyPrice: number }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ReportCard
        title="הכנסות חודשיות"
        headers={["חודש", "הכנסות"]}
        rows={monthlyRevenue.map(([month, amount]) => [month, formatCurrency(amount)])}
        csvRows={monthlyRevenue.map(([month, amount]) => [month, amount])}
        filename="הכנסות-חודשיות.csv"
      />
      <ReportCard
        title="תפוסה לפי חדר (30 יום אחרונים)"
        headers={["חדר", "הזמנות"]}
        rows={occupancy.map((o) => [o.room, String(o.count)])}
        csvRows={occupancy.map((o) => [o.room, o.count])}
        filename="תפוסה-לפי-חדר.csv"
      />
      <ReportCard
        title="שעות כרטיסיות לפי מטפל/ת"
        headers={["מטפל/ת", "שעות נותרו", "שעות נרכשו"]}
        rows={cardHoursByTherapist.map((c) => [c.name, String(c.remaining), String(c.purchased)])}
        csvRows={cardHoursByTherapist.map((c) => [c.name, c.remaining, c.purchased])}
        filename="שעות-כרטיסיות-לפי-מטפל.csv"
      />
      <ReportCard
        title="ססיות לפי מטפל/ת"
        headers={["מטפל/ת", "סטטוס", "שעות שבועיות", "מחיר חודשי"]}
        rows={sessionsByTherapist.map((s) => [
          s.name,
          SUB_STATUS_LABELS[s.status],
          String(s.weeklyHours),
          formatCurrency(s.monthlyPrice),
        ])}
        csvRows={sessionsByTherapist.map((s) => [s.name, SUB_STATUS_LABELS[s.status], s.weeklyHours, s.monthlyPrice])}
        filename="ססיות-לפי-מטפל.csv"
      />
      <ReportCard
        title="יתרות פתוחות"
        headers={["מטפל/ת", "שעות"]}
        rows={openBalances.map((b) => [b.name, String(b.hours)])}
        csvRows={openBalances.map((b) => [b.name, b.hours])}
        filename="יתרות-פתוחות.csv"
      />
      <ReportCard
        title="מטפלים לא פעילים 60 יום"
        headers={["מטפל/ת", "טלפון"]}
        rows={inactiveTherapists.map((t) => [t.name, t.phone])}
        csvRows={inactiveTherapists.map((t) => [t.name, t.phone])}
        filename="מטפלים-לא-פעילים.csv"
      />
    </div>
  );
}

function ReportCard({
  title,
  headers,
  rows,
  csvRows,
  filename,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  csvRows: (string | number)[][];
  filename: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => downloadCsv(filename, toCsv(headers, csvRows))}>
          ייצוא CSV
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין נתונים.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b text-right">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="p-1.5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className="p-1.5">
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
