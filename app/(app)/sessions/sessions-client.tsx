"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { formatDateHe, formatDateTimeHe } from "@/lib/time";
import { WEEKDAY_LABELS } from "@/lib/pricing/session";
import type { Database } from "@/lib/supabase/types";
import { initiateSessionPayment, initiateSessionRenewal, requestCancellation } from "./actions";

type Subscription = Database["public"]["Tables"]["session_subscriptions"]["Row"];
type SessionSlot = Database["public"]["Tables"]["session_slots"]["Row"];
export type SubscriptionWithSlots = Subscription & { slots: (SessionSlot & { roomName: string })[] };

const STATUS_LABELS: Record<Subscription["status"], string> = {
  requested: "ממתין לאישור הנהלה",
  awaiting_payment: "ממתין לתשלום",
  active: "פעיל",
  rejected: "נדחה",
  pending_cancellation: "בביטול",
  cancelled: "בוטל",
  expired: "פג תוקף",
};

const STATUS_STYLES: Record<Subscription["status"], string> = {
  requested: "text-amber-600 dark:text-amber-400",
  awaiting_payment: "text-amber-600 dark:text-amber-400",
  active: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-destructive",
  pending_cancellation: "text-muted-foreground",
  cancelled: "text-muted-foreground",
  expired: "text-muted-foreground",
};

// עוזר קטן להשתיק ניווט חוזר מחוץ לקומפוננטה (ניווט לדומיין חיצוני אינו state).
function navigateTo(url: string) {
  window.location.href = url;
}

export function SessionsClient({ subscriptions }: { subscriptions: SubscriptionWithSlots[] }) {
  if (subscriptions.length === 0) {
    return <p className="text-muted-foreground">אין עדיין בקשות ססיה.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {subscriptions.map((sub) => (
        <SubscriptionCard key={sub.id} subscription={sub} />
      ))}
    </div>
  );
}

function SubscriptionCard({ subscription }: { subscription: SubscriptionWithSlots }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setLoading(true);
    setError(null);
    const result = await initiateSessionPayment(subscription.id);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigateTo(result.redirectUrl);
  }

  async function handleRenew() {
    setLoading(true);
    setError(null);
    const result = await initiateSessionRenewal(subscription.id);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigateTo(result.redirectUrl);
  }

  async function handleCancelRequest() {
    if (
      !window.confirm(
        "ביטול המנוי דורש הודעה של 30 יום מראש. אם נותרו פחות מ-30 יום עד החיוב הבא, יתבצע עוד חיוב אחד לפני שהמנוי ייפסק. להמשיך?",
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    const result = await requestCancellation(subscription.id);
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">
              {subscription.weekly_hours} שעות שבועיות · {formatCurrency(subscription.monthly_price)} לחודש
            </p>
            <p className={`text-sm ${STATUS_STYLES[subscription.status]}`}>
              {STATUS_LABELS[subscription.status]}
            </p>
          </div>
        </div>

        <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
          {subscription.slots.map((s) => (
            <li key={s.id}>
              {WEEKDAY_LABELS[s.weekday]} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {s.roomName}
            </li>
          ))}
        </ul>

        {subscription.status === "rejected" && subscription.rejection_reason && (
          <p className="text-sm text-destructive">סיבת הדחייה: {subscription.rejection_reason}</p>
        )}

        {subscription.status === "requested" && (
          <p className="text-sm text-muted-foreground">
            הבקשה בבדיקה. תישלח הודעה כשתתקבל החלטה.
          </p>
        )}

        {subscription.status === "awaiting_payment" && (
          <div className="flex flex-col gap-1">
            {subscription.hold_expires_at && (
              <p className="text-sm text-muted-foreground">
                יש להשלים תשלום עד {formatDateTimeHe(new Date(subscription.hold_expires_at))}, אחרת הבקשה
                תפוג.
              </p>
            )}
            <Button size="sm" onClick={handlePay} disabled={loading} className="w-fit">
              {loading ? "מעביר לתשלום..." : "מעבר לתשלום"}
            </Button>
          </div>
        )}

        {subscription.status === "active" && (
          <div className="flex flex-col gap-1">
            {subscription.next_billing_date && (
              <p className="text-sm text-muted-foreground">
                המנוי בתוקף עד {formatDateHe(new Date(subscription.next_billing_date))} — יש לחדש עד אז כדי
                להמשיך לקבוע ססיות.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleRenew} disabled={loading} className="w-fit">
                {loading ? "מעביר לתשלום..." : "חידוש מנוי"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancelRequest} disabled={loading} className="w-fit">
                בקשת ביטול מנוי
              </Button>
            </div>
          </div>
        )}

        {subscription.status === "pending_cancellation" && subscription.effective_end_date && (
          <p className="text-sm text-muted-foreground">
            המנוי בתהליך ביטול — פעיל עד {formatDateHe(new Date(subscription.effective_end_date))}
          </p>
        )}

        {subscription.status === "expired" && (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              המנוי פג — לא ניתן לקבוע ססיות חדשות עד לחידוש.
            </p>
            <Button size="sm" onClick={handleRenew} disabled={loading} className="w-fit">
              {loading ? "מעביר לתשלום..." : "חידוש מנוי"}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
