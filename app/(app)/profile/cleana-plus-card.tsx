"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateHe } from "@/lib/time";
import { disconnectCleanaPlus } from "./actions";

// חיבור ל-Cleana+ (אפיון הסנכרון, שלב 1). כשמחובר/ת — כל קביעה ב-Cleana
// תוכל לפתוח את אותן שעות לתורים ב-Cleana+ (שלב 2).

const RESULT_MESSAGES: Record<string, { text: string; tone: "ok" | "error" }> = {
  connected: { text: "מחובר ✓ מעכשיו אפשר לפתוח שעות לתורים ב-Cleana+.", tone: "ok" },
  denied: { text: "החיבור בוטל. אפשר לנסות שוב בכל רגע.", tone: "error" },
  expired: { text: "החיבור לקח יותר מדי זמן. נסו שוב.", tone: "error" },
  unavailable: { text: "Cleana+ לא זמינה כרגע. נסו שוב בעוד כמה דקות.", tone: "error" },
  error: { text: "החיבור לא הצליח. נסו שוב.", tone: "error" },
};

interface Props {
  connected: boolean;
  connectedAt: string | null;
  accountLabel: string | null;
  /** התוצאה שחזרה מה-callback (?cleana_plus=...). */
  result: string | null;
}

export function CleanaPlusCard({ connected, connectedAt, accountLabel, result }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const message = result ? RESULT_MESSAGES[result] : undefined;

  function disconnect() {
    setError(null);
    startTransition(async () => {
      const res = await disconnectCleanaPlus();
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          חיבור ל-<span dir="ltr">Cleana+</span>
          {connected && <CheckCircle2 className="size-4 text-green-600" aria-label="מחובר" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {message && (
          <p className={message.tone === "ok" ? "text-green-700" : "text-destructive"} role="status">
            {message.text}
          </p>
        )}
        {connected ? (
          <>
            <p className="text-muted-foreground">
              מחובר{connectedAt ? ` מאז ${formatDateHe(new Date(connectedAt))}` : ""}
              {accountLabel ? (
                <>
                  {" "}
                  לחשבון <span dir="ltr">{accountLabel}</span>
                </>
              ) : null}
              . אחרי כל קביעת חדר תוכלו לפתוח את אותן שעות לתורים ב-Cleana+.
            </p>
            <div>
              <Button variant="outline" size="sm" disabled={pending} onClick={disconnect}>
                {pending ? "מנתק..." : "ניתוק"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              משתמשים גם ב-Cleana+ לזימון תורים? אחרי חיבור חד-פעמי, כל חדר שתקבעו כאן יוכל להיפתח שם לתורים
              באישור אחד. Cleana לא תראה לקוחות, תשלומים או הגדרות.
            </p>
            <div>
              <Button asChild size="sm">
                <a href="/api/cleana-plus/connect">חיבור ל-Cleana+</a>
              </Button>
            </div>
          </>
        )}
        {error && <p className="text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
