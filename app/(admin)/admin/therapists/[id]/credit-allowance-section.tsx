"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setCreditAllowanceAction } from "./actions";

/**
 * אשראי שעות — כשפעיל, המטפל/ת ממשיך/ה לקבוע תורים בעצמו/ה גם בלי יתרה
 * (הכרטיסייה יורדת למינוס, והחוב מתקזז ברכישה הבאה).
 */
export function CreditAllowanceSection({ userId, allowed }: { userId: string; allowed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const result = await setCreditAllowanceAction({ userId, allowed: !allowed });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-medium">אשראי שעות {allowed ? "· פעיל" : ""}</p>
          <p className="text-sm text-muted-foreground">
            {allowed
              ? "יכול/ה לקבוע תורים גם בלי יתרה — היתרה יורדת למינוס ומתקזזת ברכישה הבאה."
              : "כבוי — בלי יתרה אי אפשר לקבוע תור עצמאית."}
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <Button size="sm" variant={allowed ? "outline" : "default"} disabled={busy} onClick={toggle}>
          {busy ? "מעדכן..." : allowed ? "כיבוי אשראי" : "הפעלת אשראי"}
        </Button>
      </CardContent>
    </Card>
  );
}
