"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { formatDateHe } from "@/lib/time";
import { assignPendingPurchaseAction } from "./actions";

export type PendingPurchase = {
  id: string;
  wooOrderId: number;
  email: string | null;
  phone: string | null;
  hours: number;
  amountTotal: number;
  createdAt: string;
};

/**
 * רכישות Woo שלא שויכו אוטומטית (אין חשבון עם אותו מייל). מוצג בכרטיס כל
 * מטפל/ת כדי שאדמין יוכל לשייך רכישה שנעשתה במייל אחר — למשל שגיאת הקלדה
 * בחנות. השיוך סופי: יוצר כרטיסייה ותשלום וסוגר את הרכישה הממתינה.
 */
export function PendingPurchasesSection({
  userId,
  therapistName,
  therapistEmail,
  purchases,
}: {
  userId: string;
  therapistName: string;
  therapistEmail: string;
  purchases: PendingPurchase[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (purchases.length === 0) return null;

  async function assign(p: PendingPurchase) {
    const ok = window.confirm(
      `לשייך את הזמנה ${p.wooOrderId} (${p.hours} שעות, ${formatCurrency(p.amountTotal)}) ל${therapistName}?\n` +
        `המייל בהזמנה: ${p.email ?? "—"}\nהמייל של המטפל/ת: ${therapistEmail}\n\nהפעולה סופית.`,
    );
    if (!ok) return;
    setBusyId(p.id);
    setError(null);
    const result = await assignPendingPurchaseAction({ pendingId: p.id, userId });
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">רכישות מהחנות שלא שויכו ({purchases.length})</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          רכישות שנעשו בחנות במייל שאין לו חשבון ב-Cleana. אם אחת מהן שייכת ל{therapistName} (למשל קנתה במייל
          אחר או עם שגיאת הקלדה) — שייכו אותה כאן.
        </p>
        <ul className="flex flex-col divide-y">
          {purchases.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                הזמנה {p.wooOrderId} · {p.hours} שעות · {formatCurrency(p.amountTotal)} ·{" "}
                {formatDateHe(new Date(p.createdAt))}
                <br />
                <span className="text-muted-foreground" dir="ltr">
                  {p.email ?? "—"}
                  {p.phone ? ` · ${p.phone}` : ""}
                </span>
              </span>
              <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => assign(p)}>
                {busyId === p.id ? "משייך..." : "שייך למטפל/ת"}
              </Button>
            </li>
          ))}
        </ul>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
