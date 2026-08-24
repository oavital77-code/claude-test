import Link from "next/link";
import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateHe, formatDateTimeHe, accessWindow, formatTimeHe } from "@/lib/time";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

const SUB_STATUS_STYLES: Record<SubStatus, string> = {
  requested: "text-amber-600 dark:text-amber-400",
  awaiting_payment: "text-amber-600 dark:text-amber-400",
  active: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-destructive",
  pending_cancellation: "text-muted-foreground",
  cancelled: "text-muted-foreground",
  expired: "text-muted-foreground",
};

export default async function HomePage() {
  const { userId, profile } = await requireTherapistProfile();
  const supabase = await createClient();

  const [{ data: cards }, { data: nextBooking }, { data: sessionSubscriptions }] = await Promise.all([
    supabase
      .from("punch_cards")
      .select("hours_remaining, deposit_amount, deposit_remaining, expires_at")
      .eq("user_id", userId)
      .eq("active", true)
      .gt("expires_at", new Date().toISOString()),
    supabase
      .from("bookings")
      .select("id, room_id, starts_at, ends_at")
      .eq("user_id", userId)
      .eq("status", "confirmed")
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("session_subscriptions")
      .select("id, status, weekly_hours, monthly_price, next_billing_date")
      .eq("user_id", userId)
      .in("status", ["requested", "awaiting_payment", "active", "pending_cancellation"])
      .order("created_at", { ascending: false }),
  ]);

  const hoursRemaining = (cards ?? []).reduce((sum, c) => sum + c.hours_remaining, 0);
  const depositShort = (cards ?? []).some((c) => c.deposit_remaining < c.deposit_amount);
  const nearestExpiry = (cards ?? [])
    .map((c) => new Date(c.expires_at))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  let nextRoomName: string | null = null;
  let nextBranchName: string | null = null;
  if (nextBooking) {
    const { data: room } = await supabase
      .from("rooms")
      .select("name, branch_id")
      .eq("id", nextBooking.room_id)
      .maybeSingle();
    nextRoomName = room?.name ?? null;
    if (room) {
      const { data: branch } = await supabase
        .from("branches")
        .select("name")
        .eq("id", room.branch_id)
        .maybeSingle();
      nextBranchName = branch?.name ?? null;
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">שלום, {profile.full_name}</h1>

      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-1 p-4">
          <p className="text-3xl font-semibold">{hoursRemaining} שעות</p>
          <p className="text-sm text-muted-foreground">יתרה זמינה</p>
          {nearestExpiry && (
            <p className="text-xs text-muted-foreground">
              תוקף קרוב: {formatDateHe(nearestExpiry)}
            </p>
          )}
          {depositShort && (
            <p className="text-sm text-destructive">
              יש להשלים פיקדון — הזמנות חדשות חסומות עד ההשלמה
            </p>
          )}
          {hoursRemaining === 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-500">
              לא נותרו לך שעות — יש לרכוש כרטיסייה כדי להמשיך לקבוע תורים.
            </p>
          )}
          {hoursRemaining > 0 && hoursRemaining <= 2 && (
            <p className="text-sm text-amber-600 dark:text-amber-500">
              ⚠️ נשארו לך רק {hoursRemaining} שעות — כדאי לרכוש כרטיסייה נוספת בקרוב.
            </p>
          )}
          {hoursRemaining > 0 && !depositShort && (
            <Button asChild className="mt-2">
              <Link href="/schedule">קביעת תור עכשיו</Link>
            </Button>
          )}
          {hoursRemaining <= 2 && (
            <Button asChild variant="outline" className="mt-2">
              <Link href="/purchase">רכישת כרטיסייה</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {sessionSubscriptions && sessionSubscriptions.length > 0 && (
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col gap-2 p-4 text-right">
            <p className="text-sm text-muted-foreground">הססיות שלי</p>
            {sessionSubscriptions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{s.weekly_hours} שעות שבועיות</p>
                  <p className={`text-xs ${SUB_STATUS_STYLES[s.status]}`}>{SUB_STATUS_LABELS[s.status]}</p>
                  {s.status === "active" && s.next_billing_date && (
                    <p className="text-xs text-muted-foreground">
                      חיוב הבא: {formatDateHe(new Date(s.next_billing_date))}
                    </p>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{formatCurrency(s.monthly_price)}/חודש</p>
              </div>
            ))}
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link href="/sessions">כל הססיות שלי</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {nextBooking && (
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col gap-1 p-4 text-right">
            <p className="text-sm text-muted-foreground">ההזמנה הבאה</p>
            <p className="font-medium">
              {nextBranchName ? `${nextBranchName} · ` : ""}
              {nextRoomName} · {formatDateTimeHe(new Date(nextBooking.starts_at))}
            </p>
            <p className="text-xs text-muted-foreground">
              🔑 כניסה בפועל:{" "}
              {formatTimeHe(accessWindow(new Date(nextBooking.starts_at), new Date(nextBooking.ends_at)).accessStart)}
              {profile.door_code && ` · קוד דלת: ${profile.door_code}`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
