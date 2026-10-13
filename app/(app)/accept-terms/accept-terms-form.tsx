"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { TERMS_TEXT } from "@/lib/terms/current";
import { acceptTermsAction } from "./actions";

export function AcceptTermsForm() {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    // במקרה של הצלחה הפעולה מפנה לדף הבית ולא חוזרת לכאן.
    const result = await acceptTermsAction(accepted);
    setLoading(false);
    setError(result.error);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="max-h-80 overflow-y-auto whitespace-pre-line rounded-md border p-4 text-sm">{TERMS_TEXT}</div>
      <div className="flex items-center gap-2">
        <Checkbox id="accepted" checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} />
        <Label htmlFor="accepted" className="font-normal">
          קראתי, הבנתי ואני מסכים/ה לתנאי הסכם השירות
        </Label>
      </div>
      <a href="/privacy" target="_blank" rel="noreferrer" className="text-sm text-primary underline underline-offset-4">
        מדיניות הפרטיות
      </a>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={submit} disabled={loading || !accepted}>
        {loading ? "שומר..." : "אני מאשר/ת וחותם/ת"}
      </Button>
    </div>
  );
}
