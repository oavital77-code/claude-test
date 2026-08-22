"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
  branches,
  inactiveTherapists,
  cardHoursByTherapist,
  sessionsByTherapist,
}: {
  monthlyRevenue: [string, number][];
  occupancy: { room: string; branchId: string; count: number }[];
  branches: { id: string; name: string }[];
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
      <OccupancyReportCard occupancy={occupancy} branches={branches} />
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
        title="מטפלים לא פעילים 60 יום"
        headers={["מטפל/ת", "טלפון"]}
        rows={inactiveTherapists.map((t) => [t.name, t.phone])}
        csvRows={inactiveTherapists.map((t) => [t.name, t.phone])}
        filename="מטפלים-לא-פעילים.csv"
      />
    </div>
  );
}

function OccupancyReportCard({
  occupancy,
  branches,
}: {
  occupancy: { room: string; branchId: string; count: number }[];
  branches: { id: string; name: string }[];
}) {
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id ?? "");
  const branchName = branches.find((b) => b.id === selectedBranchId)?.name ?? "";
  const filtered = occupancy.filter((o) => o.branchId === selectedBranchId);
  const rows = filtered.map((o) => [o.room, String(o.count)]);
  const csvRows = filtered.map((o) => [o.room, o.count]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">תפוסה לפי חדר (30 יום אחרונים)</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => downloadCsv(`תפוסה-לפי-חדר-${branchName}.csv`, toCsv(["חדר", "הזמנות"], csvRows))}
        >
          ייצוא CSV
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {branches.length > 1 && (
          <div role="tablist" className="flex w-fit gap-1 rounded-md border p-1">
            {branches.map((b) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={b.id === selectedBranchId}
                onClick={() => setSelectedBranchId(b.id)}
                className={cn(
                  "rounded px-3 py-1 text-sm transition-colors",
                  b.id === selectedBranchId
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין נתונים.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b text-right">
                <tr>
                  <th className="p-1.5">חדר</th>
                  <th className="p-1.5">הזמנות</th>
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
