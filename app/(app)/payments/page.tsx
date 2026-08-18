import { requireTherapistProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format";
import { formatDateTimeHe } from "@/lib/time";
import { Card, CardContent } from "@/components/ui/card";
import type { Database } from "@/lib/supabase/types";

type Payment = Database["public"]["Tables"]["payments"]["Row"];

const TYPE_LABELS: Record<Payment["type"], string> = {
  punch_card: "כרטיסייה",
  session_initial: "ססיה — תשלום ראשון",
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

const STATUS_STYLES: Record<Payment["status"], string> = {
  pending: "text-amber-600 dark:text-amber-400",
  paid: "text-emerald-600 dark:text-emerald-400",
  failed: "text-destructive",
  refunded: "text-muted-foreground",
};

export default async function PaymentsPage() {
  const { userId } = await requireTherapistProfile();
  const supabase = await createClient();

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">התשלומים שלי</h1>

      {!payments || payments.length === 0 ? (
        <p className="text-muted-foreground">עדיין אין תשלומים.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {payments.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-medium">{TYPE_LABELS[p.type]}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTimeHe(new Date(p.created_at))}
                  </p>
                </div>
                <div className="text-left">
                  <p className="font-medium">{formatCurrency(p.amount_total)}</p>
                  <p className={`text-sm ${STATUS_STYLES[p.status]}`}>{STATUS_LABELS[p.status]}</p>
                </div>
                {p.invoice_url ? (
                  <a
                    href={p.invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline underline-offset-4"
                  >
                    חשבונית
                  </a>
                ) : p.status === "paid" ? (
                  <span className="text-sm text-muted-foreground">
                    קישור לחשבונית יופיע כאן בקרוב
                  </span>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
