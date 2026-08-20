"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { formatDateHe } from "@/lib/time";
import { WEEKDAY_LABELS } from "@/lib/pricing/session";
import type { Database } from "@/lib/supabase/types";
import { approveSessionAction, rejectSessionAction } from "./actions";

type Subscription = Database["public"]["Tables"]["session_subscriptions"]["Row"];
type SessionSlot = Database["public"]["Tables"]["session_slots"]["Row"];
export type AdminSubscriptionRow = Subscription & {
  therapistName: string;
  therapistPhone: string;
  slots: (SessionSlot & { roomName: string })[];
};

export function AdminSessionsClient({ rows }: { rows: AdminSubscriptionRow[] }) {
  const requested = rows.filter((r) => r.status === "requested");
  const awaitingPayment = rows.filter((r) => r.status === "awaiting_payment");
  const active = rows.filter((r) => r.status === "active");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">ממתינות לאישור ({requested.length})</h2>
        {requested.length === 0 ? (
          <p className="text-muted-foreground">אין בקשות ממתינות.</p>
        ) : (
          requested.map((row) => <RequestCard key={row.id} row={row} />)
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">ממתינות לתשלום ({awaitingPayment.length})</h2>
        {awaitingPayment.map((row) => (
          <ReadonlyCard key={row.id} row={row} note={`תוקף עד ${row.hold_expires_at ? formatDateHe(new Date(row.hold_expires_at)) : "-"}`} />
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">ססיות פעילות ({active.length})</h2>
        {active.map((row) => (
          <ReadonlyCard
            key={row.id}
            row={row}
            note={row.next_billing_date ? `חיוב הבא: ${formatDateHe(new Date(row.next_billing_date))}` : ""}
          />
        ))}
      </section>
    </div>
  );
}

function SlotsList({ slots }: { slots: AdminSubscriptionRow["slots"] }) {
  return (
    <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
      {slots.map((s) => (
        <li key={s.id}>
          {WEEKDAY_LABELS[s.weekday]} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {s.roomName}
        </li>
      ))}
    </ul>
  );
}

function ReadonlyCard({ row, note }: { row: AdminSubscriptionRow; note?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <p className="font-medium">
          {row.therapistName} · {row.weekly_hours} ש׳/שבוע · {formatCurrency(row.monthly_price)}/חודש
        </p>
        <SlotsList slots={row.slots} />
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

function RequestCard({ row }: { row: AdminSubscriptionRow }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setLoading(true);
    setError(null);
    const result = await approveSessionAction(row.id);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleReject() {
    if (!reason.trim()) {
      setError("יש לציין סיבת דחייה");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await rejectSessionAction(row.id, reason.trim());
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <p className="font-medium">
          {row.therapistName} · {row.therapistPhone} · {row.weekly_hours} ש׳/שבוע ·{" "}
          {formatCurrency(row.monthly_price)}/חודש
        </p>
        <SlotsList slots={row.slots} />
        {error && <p className="text-sm text-destructive">{error}</p>}

        {showReject ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="סיבת דחייה"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleReject} disabled={loading}>
                אישור דחייה
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowReject(false)}>
                ביטול
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" onClick={handleApprove} disabled={loading}>
              {loading ? "מאשר..." : "אישור"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowReject(true)} disabled={loading}>
              דחייה
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
