"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
import {
  emailFormSchema,
  otpFormSchema,
  detailsFormSchema,
  type DetailsFormValues,
} from "@/lib/validation/registration";
import { TERMS_TEXT } from "@/lib/terms/current";
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

type Step = "email" | "otp" | "details" | "terms";

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

  const [step, setStep] = useState<Step>(skipToDetails ? "details" : "email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [details, setDetails] = useState<DetailsFormValues>(emptyDetails);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    linkExpiredError ? "הקישור פג תוקף או שכבר נעשה בו שימוש. יש לבקש קוד חדש." : null,
  );

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = emailFormSchema.safeParse({ email });
    if (!parsed.success) {
      setError(z.prettifyError(parsed.error));
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);

    if (error) {
      setError("שליחת הקוד נכשלה. בדקו את הכתובת ונסו שוב.");
      return;
    }
    setEmail(parsed.data.email);
    setStep("otp");
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = otpFormSchema.safeParse({ code });
    if (!parsed.success) {
      setError(z.prettifyError(parsed.error));
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (error || !data.user) {
      setLoading(false);
      setError("קוד שגוי או שפג תוקפו. נסו שוב.");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();
    setLoading(false);

    if (profile) {
      router.push("/");
      return;
    }
    setStep("details");
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
        <CardTitle className="text-xl font-bold text-primary">Cleana</CardTitle>
        <CardDescription>{stepDescription(step)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {step === "email" && (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
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
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "שולח..." : "שליחת קוד אימות"}
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              נשלח מייל לכתובת {email} — אפשר להזין כאן את הקוד בן 6
              הספרות מהמייל, או ללחוץ על הקישור שבמייל.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">קוד אימות</Label>
              <Input
                id="code"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                dir="ltr"
                className="text-center tracking-[0.5em]"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "מאמת..." : "אימות"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
            >
              שינוי כתובת מייל
            </Button>
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
    case "email":
      return "התחברות / הרשמה באמצעות כתובת מייל";
    case "otp":
      return "אימות כתובת המייל";
    case "details":
      return "פרטים אישיים";
    case "terms":
      return "הסכם שירות";
  }
}
