"use client";

import { useState } from "react";
import { computePunchCardPricing } from "@/lib/pricing/punchCard";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { Database } from "@/lib/supabase/types";
import { initiatePunchCardPurchase } from "./actions";

type Tier = Database["public"]["Tables"]["punch_card_tiers"]["Row"];

// מחוץ לקומפוננטה בכוונה: ניווט לדומיין חיצוני (PayPlus) אינו state של React.
function navigateTo(url: string) {
  window.location.href = url;
}

export function PurchaseClient({ tiers, vatRate }: { tiers: Tier[]; vatRate: number }) {
  const [loadingTierId, setLoadingTierId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePurchase(tierId: string) {
    setError(null);
    setLoadingTierId(tierId);
    const result = await initiatePunchCardPurchase(tierId);
    if (!result.ok) {
      setLoadingTierId(null);
      setError(result.error);
      return;
    }
    navigateTo(result.redirectUrl);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map((tier) => {
          const pricing = computePunchCardPricing(tier, vatRate);
          return (
            <Card key={tier.id}>
              <CardHeader>
                <CardTitle>{tier.hours} שעות</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(tier.price_per_hour)} לשעה
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">כרטיסייה</span>
                  <span>{formatCurrency(pricing.price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">פיקדון ({tier.deposit_hours} ש׳)</span>
                  <span>{formatCurrency(pricing.deposit)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">מע״מ ({Math.round(vatRate * 100)}%)</span>
                  <span>{formatCurrency(pricing.vat)}</span>
                </div>
                <div className="mt-1 flex justify-between border-t pt-1 font-medium">
                  <span>לתשלום</span>
                  <span>{formatCurrency(pricing.total)}</span>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  disabled={loadingTierId !== null}
                  onClick={() => handlePurchase(tier.id)}
                >
                  {loadingTierId === tier.id ? "מעביר לתשלום..." : "רכישה"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
