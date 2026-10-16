"use client";

import { useState } from "react";
import { authErrorMessage } from "@/lib/auth-errors";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
import { newPasswordSchema } from "@/lib/validation/registration";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ResetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = newPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setError(z.prettifyError(parsed.error));
      return;
    }

    setLoading(true);
    // must_change_password: מנקה את סימון ה"סיסמה זמנית" (אם האדמין קבע כזו).
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
      data: { must_change_password: false },
    });
    setLoading(false);

    if (error) {
      setError(authErrorMessage(error, "reset"));
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>
          <Logo markClassName="size-12" wordmarkClassName="text-2xl" />
        </CardTitle>
        <CardDescription>בחירת סיסמה חדשה</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">סיסמה חדשה</Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
              className="text-left"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">לפחות 8 תווים, ולא סיסמה נפוצה (כמו 12345678 או qwerty123)</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm">אימות סיסמה</Label>
            <Input
              id="confirm"
              type="password"
              dir="ltr"
              className="text-left"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "שומר..." : "שמירת הסיסמה החדשה"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
