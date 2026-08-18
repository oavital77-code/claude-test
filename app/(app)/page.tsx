import Link from "next/link";
import { requireTherapistProfile } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const { profile } = await requireTherapistProfile();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">שלום, {profile.full_name}</h1>
      <p className="text-muted-foreground">יתרות ותשלומים בבנייה — M3 ואילך.</p>
      <Button asChild>
        <Link href="/schedule">לוח הזמנים</Link>
      </Button>
    </div>
  );
}
