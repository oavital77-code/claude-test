"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
import {
  authFormSchema,
  detailsFormSchema,
  type DetailsFormValues,
} from "@/lib/validation/registration";
import { TERMS_TEXT } from "@/lib/terms/current";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { completeRegistration } from "./actions";

type Step = "auth" | "details" | "terms";

const emptyDetails: DetailsFormValues = {
  full_name: "",
  phone: "",
  national_id: "",
  profession: "",
  business_number: "",
};

export function RegistrationWizard({
  skipToDetails,
  linkExpiredError,
}: {
  skipToDetails: boolean;
  linkExpiredError?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>(skipToDetails ? "details" : "auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [details, setDetails] = useState<DetailsFormValues>(emptyDetails);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    linkExpiredError ? "הקישור פג תוקף או שכבר נעשה בו שימוש." : null,
  );

  /** בודק אם למשתמש שהתחבר/נרשם כרגע כבר יש פרופיל, ומנתב בהתאם. */
  async function proceedAfterAuth(userId: string) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (profile) {
      router.push("/");
      router.refresh();
      return;
    }
    setStep("details");
  }

  async function handleRegister(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);

    const parsed = authFormSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(z.prettifyError(parsed.error));
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);

    if (error) {
      if (/already registered|already exists|user_already_exists/i.test(error.message)) {
        setError("כתובת המייל כבר בשימוש. אם זה אתה — לחץ/י על \"התחברות\" במקום.");
      } else {
        setError(`ההרשמה נכשלה: ${error.message}`);
      }
      return;
    }
    if (!data.user) {
      setError("ההרשמה נכשלה. נסו שוב.");
      return;
    }
    if (!data.session) {
      // נדרש אישור מייל בצד Supabase (עדיין לא כובה בהגדרות) — אין לנו כרגע
      // דרך לשלוח את המייל הזה בפועל (ר' באג Resend sandbox).
      setError("ההרשמה נוצרה אך נדרש אישור מייל בצד השרת. יש לפנות למנהל המערכת.");
      return;
    }

    setEmail(parsed.data.email);
    await proceedAfterAuth(data.user.id);
  }

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);

    const parsed = authFormSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(z.prettifyError(parsed.error));
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);

    if (error || !data.user) {
      setError("אימייל או סיסמה שגויים.");
      return;
    }

    setEmail(parsed.data.email);
    await proceedAfterAuth(data.user.id);
  }

  function handleSubmitDetails(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = detailsFormSchema.safeParse(details);
    if (!parsed.success) {
      setError(z.prettifyError(parsed.error));
      return;
    }
    setStep("terms");
  }

  async function handleConfirmTerms() {
    setError(null);
    if (!accepted) {
      setError("יש לאשר את תקנון השירות כדי להמשיך");
      return;
    }

    setLoading(true);
    const result = await completeRegistration(details, accepted);
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
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
        <CardDescription>{stepDescription(step)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {step === "auth" && (
          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">כתובת מייל</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
                className="text-left"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                className="text-left"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">לפחות 8 תווים</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? "נרשם/ת..." : "הרשמה"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                className="flex-1"
                onClick={() => handleLogin()}
              >
                {loading ? "מתחבר/ת..." : "התחברות"}
              </Button>
            </div>
          </form>
        )}

        {step === "details" && (
          <form onSubmit={handleSubmitDetails} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="full_name">שם מלא *</Label>
              <Input
                id="full_name"
                value={details.full_name}
                onChange={(e) => setDetails({ ...details, full_name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="details_phone">מספר טלפון *</Label>
              <Input
                id="details_phone"
                type="tel"
                dir="ltr"
                className="text-left"
                placeholder="05X-XXXXXXX"
                value={details.phone}
                onChange={(e) => setDetails({ ...details, phone: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profession">תחום טיפול *</Label>
              <Input
                id="profession"
                value={details.profession}
                onChange={(e) => setDetails({ ...details, profession: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="national_id">תעודת זהות</Label>
              <Input
                id="national_id"
                dir="ltr"
                className="text-left"
                value={details.national_id}
                onChange={(e) => setDetails({ ...details, national_id: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="business_number">מספר עוסק / ח.פ</Label>
              <Input
                id="business_number"
                dir="ltr"
                className="text-left"
                value={details.business_number}
                onChange={(e) =>
                  setDetails({ ...details, business_number: e.target.value })
                }
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit">המשך לתקנון</Button>
          </form>
        )}

        {step === "terms" && (
          <div className="flex flex-col gap-4">
            <div className="max-h-64 overflow-y-auto whitespace-pre-line rounded-md border p-4 text-sm">
              {TERMS_TEXT}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="accepted"
                checked={accepted}
                onCheckedChange={(v) => setAccepted(v === true)}
              />
              <Label htmlFor="accepted" className="font-normal">
                קראתי, הבנתי ואני מסכים/ה לתנאי הסכם השירות
              </Label>
            </div>
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline underline-offset-4"
            >
              מדיניות הפרטיות
            </a>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleConfirmTerms} disabled={loading || !accepted}>
              {loading ? "שומר..." : "אני מאשר/ת וחותם/ת"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep("details")}>
              חזרה לפרטים
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function stepDescription(step: Step) {
  switch (step) {
    case "auth":
      return "התחברות / הרשמה עם מייל וסיסמה";
    case "details":
      return "פרטים אישיים";
    case "terms":
      return "הסכם שירות";
  }
}
