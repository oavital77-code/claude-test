import Link from "next/link";
import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateHe, formatDateTimeHe, accessWindow, formatTimeHe } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function HomePage() {
  const { userId, profile } = await requireTherapistProfile();
  const supabase = await createClient();

  const [{ data: cards }, { data: nextBooking }] = await Promise.all([
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
  ]);

  const hoursRemaining = (cards ?? []).reduce((sum, c) => sum + c.hours_remaining, 0);
  const depositShort = (cards ?? []).some((c) => c.deposit_remaining < c.deposit_amount);
  const nearestExpiry = (cards ?? [])
    .map((c) => new Date(c.expires_at))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  let nextRoomName: string | null = null;
  if (nextBooking) {
    const { data: room } = await supabase
      .from("rooms")
      .select("name")
      .eq("id", nextBooking.room_id)
      .maybeSingle();
    nextRoomName = room?.name ?? null;
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
        </CardContent>
      </Card>

      {nextBooking && (
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col gap-1 p-4 text-right">
            <p className="text-sm text-muted-foreground">ההזמנה הבאה</p>
            <p className="font-medium">
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

      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/schedule">לוח הזמנים</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/bookings">ההזמנות שלי</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/purchase">רכישת כרטיסייה</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sessions">הססיות שלי</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/payments">התשלומים שלי</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/waitlist">רשימת המתנה</Link>
        </Button>
      </div>
    </div>
  );
}
