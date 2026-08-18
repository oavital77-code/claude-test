"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { formatDateTimeHe } from "@/lib/time";
import type { Database } from "@/lib/supabase/types";
import { adminMarkPaidAction } from "./actions";

type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type PaymentRow = Payment & { therapistName: string };

const TYPE_LABELS: Record<Payment["type"], string> = {
  punch_card: "כרטיסייה",
  session_initial: "ססיה — ראשוני",
  session_recurring: "ססיה — חידוש",
  overrun: "חריגה",
  deposit_topup: "השלמת פיקדון",
};

const STATUS_LABELS: Record<Payment["status"], string> = {
  pending: "ממתין",
  paid: "שולם",
  failed: "נכשל",
  refunded: "זוכה",
};

export function AdminPaymentsClient({ rows }: { rows: PaymentRow[] }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<Payment["status"] | "all">("all");
  const [typeFilter, setTypeFilter] = useState<Payment["type"] | "all">("all");

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) => (statusFilter === "all" || r.status === statusFilter) && (typeFilter === "all" || r.type === typeFilter),
      ),
    [rows, statusFilter, typeFilter],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Payment["status"] | "all")}
        >
          <option value="all">כל הסטטוסים</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as Payment["type"] | "all")}
        >
          <option value="all">כל הסוגים</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-right">
            <tr>
              <th className="p-2">תאריך</th>
              <th className="p-2">מטפל/ת</th>
              <th className="p-2">סוג</th>
              <th className="p-2">סכום</th>
              <th className="p-2">סטטוס</th>
              <th className="p-2">אסמכתא</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <PaymentRowLine key={p.id} payment={p} onChanged={() => router.refresh()} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentRowLine({ payment, onChanged }: { payment: PaymentRow; onChanged: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMarkPaid() {
    setLoading(true);
    setError(null);
    const result = await adminMarkPaidAction(payment.id);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChanged();
  }

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="p-2">{formatDateTimeHe(new Date(payment.created_at))}</td>
      <td className="p-2">{payment.therapistName}</td>
      <td className="p-2">{TYPE_LABELS[payment.type]}</td>
      <td className="p-2">{formatCurrency(payment.amount_total)}</td>
      <td className="p-2">{STATUS_LABELS[payment.status]}</td>
      <td className="p-2 text-xs text-muted-foreground" dir="ltr">
        {payment.payplus_transaction_uid ?? "-"}
      </td>
      <td className="p-2">
        {payment.status === "pending" && (
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="outline" onClick={handleMarkPaid} disabled={loading}>
              {loading ? "מעדכן..." : "סימון כשולם"}
            </Button>
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        )}
      </td>
    </tr>
  );
}
