import Link from "next/link";
import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDateHe } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function HomePage() {
  const { userId, profile } = await requireTherapistProfile();
  const supabase = await createClient();

  const { data: cards } = await supabase
    .from("punch_cards")
    .select("hours_remaining, deposit_amount, deposit_remaining, expires_at")
    .eq("user_id", userId)
    .eq("active", true)
    .gt("expires_at", new Date().toISOString());

  const hoursRemaining = (cards ?? []).reduce((sum, c) => sum + c.hours_remaining, 0);
  const depositShort = (cards ?? []).some((c) => c.deposit_remaining < c.deposit_amount);
  const nearestExpiry = (cards ?? [])
    .map((c) => new Date(c.expires_at))
    .sort((a, b) => a.getTime() - b.getTime())[0];

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

      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/schedule">לוח הזמנים</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/purchase">רכישת כרטיסייה</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/payments">התשלומים שלי</Link>
        </Button>
      </div>
    </div>
  );
}
