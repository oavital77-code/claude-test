import Link from "next/link";
import { requireTherapistProfile } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";

export default async function PurchaseFailurePage() {
  await requireTherapistProfile();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">התשלום לא הושלם</h1>
      <p className="max-w-sm text-muted-foreground">
        משהו השתבש בתהליך התשלום. אפשר לנסות שוב, או לפנות להנהלת בקליניקה אם התקלה חוזרת.
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href="/purchase">ניסיון נוסף</Link>
        </Button>
        <Button asChild>
          <Link href="/">בית</Link>
        </Button>
      </div>
    </div>
  );
}
