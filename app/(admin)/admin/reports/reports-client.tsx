"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { toCsv, downloadCsv } from "@/lib/csv";

export function ReportsClient({
  monthlyRevenue,
  occupancy,
  openBalances,
  inactiveTherapists,
}: {
  monthlyRevenue: [string, number][];
  occupancy: { room: string; count: number }[];
  openBalances: { name: string; hours: number }[];
  inactiveTherapists: { name: string; phone: string }[];
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
