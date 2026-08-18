import Link from "next/link";
import { requireTherapistProfile } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";

// ⚠️ מסך זה הוא redirect בלבד לאחר תשלום ב-PayPlus — לא מקור האמת.
// הפעלת הכרטיסייה קורית ב-callback (app/api/payplus/callback), שעשוי
// להגיע לפני, אחרי, או במקביל לחזרת המשתמש לכאן. ר' spec §7.4.
export default async function PurchaseSuccessPage() {
  await requireTherapistProfile();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">התשלום התקבל</h1>
      <p className="max-w-sm text-muted-foreground">
        הכרטיסייה תופעל בתוך מספר רגעים לאחר אישור סופי מחברת הסליקה. ניתן לעקוב אחרי הסטטוס
        בעמוד התשלומים.
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href="/payments">התשלומים שלי</Link>
        </Button>
        <Button asChild>
          <Link href="/">בית</Link>
        </Button>
      </div>
    </div>
  );
}
