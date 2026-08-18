"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
import { toE164Israel } from "@/lib/phone";
import {
  phoneFormSchema,
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

type Step = "phone" | "otp" | "details" | "terms";

const emptyDetails: DetailsFormValues = {
  full_name: "",
  email: "",
  national_id: "",
  profession: "",
  business_number: "",
};

export function RegistrationWizard({ skipToDetails }: { skipToDetails: boolean }) {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>(skipToDetails ? "details" : "phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [details, setDetails] = useState<DetailsFormValues>(emptyDetails);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = phoneFormSchema.safeParse({ phone });
    if (!parsed.success) {
      setError(z.prettifyError(parsed.error));
      return;
    }

    const e164 = toE164Israel(phone)!;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    setLoading(false);

    if (error) {
      setError("שליחת הקוד נכשלה. בדקו את המספר ונסו שוב.");
      return;
    }
    setPhone(e164);
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
      phone,
      token: code,
      type: "sms",
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
        <CardTitle className="text-xl">בקליניקה</CardTitle>
        <CardDescription>{stepDescription(step)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {step === "phone" && (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">מספר טלפון</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                placeholder="05X-XXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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
              נשלח קוד בן 6 ספרות למספר {phone}
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
                setStep("phone");
                setCode("");
                setError(null);
              }}
            >
              שינוי מספר טלפון
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
              <Label htmlFor="email">מייל *</Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                className="text-left"
                value={details.email}
                onChange={(e) => setDetails({ ...details, email: e.target.value })}
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
    case "phone":
      return "התחברות / הרשמה באמצעות מספר טלפון";
    case "otp":
      return "אימות מספר הטלפון";
    case "details":
      return "פרטים אישיים";
    case "terms":
      return "הסכם שירות";
  }
}
