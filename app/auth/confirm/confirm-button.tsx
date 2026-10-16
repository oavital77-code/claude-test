"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmEmailLink } from "./actions";

export function ConfirmButton({
  tokenHash,
  type,
  next,
  label,
}: {
  tokenHash: string;
  type: string;
  next: string;
  label: string;
}) {
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  async function handleClick() {
    if (state === "working") return;
    setState("working");
    const res = await confirmEmailLink({ tokenHash, type, next });
    if (res.ok) {
      // טעינה מלאה — ה-cookie של הסשן נקלט לפני העמוד הבא.
      window.location.assign(res.next);
      return;
    }
    setState("failed");
  }

  if (state === "failed") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-destructive">הקישור כבר נוצל או שפג תוקפו. אפשר לבקש קישור חדש ממסך ההתחברות.</p>
        <Button asChild variant="outline">
          <a href="/login">למסך ההתחברות</a>
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" size="lg" disabled={state === "working"} onClick={handleClick}>
      {state === "working" ? "רגע..." : label}
    </Button>
  );
}
