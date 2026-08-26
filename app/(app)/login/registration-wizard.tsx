"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
import {
  authFormSchema,
  detailsFormSchema,
  emailOnlySchema,
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

type Step = "auth" | "forgot" | "sent" | "details" | "terms";
/** מה נשלח למייל — קובע את הנוסח במסך "נשלח" ואת פעולת השליחה החוזרת. */
type SentKind = "verify" | "reset";

const RESEND_COOLDOWN_SECONDS = 60;

const emptyDetails: DetailsFormValues = {
  full_name: "",
  phone: "",
  national_id: "",
  profession: "",
  business_number: "",
};

/** יעד הקישור שנשלח במייל. נגזר מהדפדפן כדי שיעבוד גם ב-preview ובפיתוח. */
function callbackUrl(next: string) {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

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
  const [sentKind, setSentKind] = useState<SentKind>("verify");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [details, setDetails] = useState<DetailsFormValues>(emptyDetails);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(
    linkExpiredError ? "הקישור פג תוקף או שכבר נעשה בו שימוש." : null,
  );

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

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

  function goToSent(kind: SentKind) {
    setSentKind(kind);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setNotice(null);
    setError(null);
    setStep("sent");
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
      options: { emailRedirectTo: callbackUrl("/login") },
    });
    setLoading(false);

    if (error) {
      if (/already registered|already exists|user_already_exists/i.test(error.message)) {
        setError('כתובת המייל כבר בשימוש. אם זה אתה — לחץ/י על "התחברות" במקום.');
      } else {
        setError(`ההרשמה נכשלה: ${error.message}`);
      }
      return;
    }
    if (!data.user) {
      setError("ההרשמה נכשלה. נסו שוב.");
      return;
    }

    setEmail(parsed.data.email);

    // אין session → Supabase מחכה לאישור מייל. זו גם התשובה שמתקבלת כשכתובת
    // המייל כבר רשומה (Supabase לא מגלה את זה בכוונה), ובשני המקרים המסך
    // הנכון להציג זהה: "שלחנו לך קישור".
    if (!data.session) {
      goToSent("verify");
      return;
    }

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

    if (error) {
      if (/not confirmed|email_not_confirmed/i.test(error.message)) {
        setEmail(parsed.data.email);
        goToSent("verify");
        return;
      }
      setError("אימייל או סיסמה שגויים.");
      return;
    }
    if (!data.user) {
      setError("אימייל או סיסמה שגויים.");
      return;
    }

    setEmail(parsed.data.email);
    await proceedAfterAuth(data.user.id);
  }

  async function handleForgot(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);

    const parsed = emailOnlySchema.safeParse({ email });
    if (!parsed.success) {
      setError(z.prettifyError(parsed.error));
      return;
    }

    setLoading(true);
    // Supabase לא מחזירה שגיאה על כתובת שלא קיימת — בכוונה, כדי שלא יהיה
    // אפשר לברר דרך המסך הזה מי רשום במערכת. לכן המסך הבא זהה בכל מקרה.
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: callbackUrl("/reset-password"),
    });
    setLoading(false);

    setEmail(parsed.data.email);
    goToSent("reset");
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setError(null);
    setNotice(null);
    setLoading(true);

    if (sentKind === "reset") {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: callbackUrl("/reset-password"),
      });
    } else {
      await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: callbackUrl("/login") },
      });
    }

    setLoading(false);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setNotice("שלחנו שוב. בדקו גם בתיקיית הספאם.");
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

  function backToAuth() {
    setError(null);
    setNotice(null);
    setPassword("");
    setStep("auth");
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>
          <Logo markClassName="size-12" wordmarkClassName="text-2xl" />
        </CardTitle>
        <CardDescription>{stepDescription(step, sentKind)}</CardDescription>
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-center"
              onClick={() => {
                setError(null);
                setStep("forgot");
              }}
            >
              שכחתי סיסמה
            </Button>
          </form>
        )}

        {step === "forgot" && (
          <form onSubmit={handleForgot} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              נשלח לך קישור לבחירת סיסמה חדשה. הקישור תקף לזמן מוגבל.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="forgot_email">כתובת המייל שאיתה נרשמת</Label>
              <Input
                id="forgot_email"
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
              {loading ? "שולח..." : "שליחת קישור לאיפוס"}
            </Button>
            <Button type="button" variant="ghost" onClick={backToAuth}>
              חזרה להתחברות
            </Button>
          </form>
        )}

        {step === "sent" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              שלחנו הודעה לכתובת{" "}
              <span dir="ltr" className="font-medium">
                {email}
              </span>
              .
            </p>
            <p className="text-sm text-muted-foreground">
              {sentKind === "verify"
                ? "יש לפתוח את המייל וללחוץ על קישור האימות, ואז לחזור לכאן להשלמת ההרשמה. אם ההודעה לא הגיעה — כדאי לבדוק בתיקיית הספאם."
                : "יש לפתוח את המייל וללחוץ על הקישור כדי לבחור סיסמה חדשה. אם ההודעה לא הגיעה — כדאי לבדוק בתיקיית הספאם."}
            </p>
            {notice && <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="button"
              variant="outline"
              disabled={loading || cooldown > 0}
              onClick={handleResend}
            >
              {cooldown > 0 ? `שליחה חוזרת בעוד ${cooldown} שניות` : "שליחה חוזרת"}
            </Button>
            <Button type="button" variant="ghost" onClick={backToAuth}>
              חזרה להתחברות
            </Button>
          </div>
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

function stepDescription(step: Step, sentKind: SentKind) {
  switch (step) {
    case "auth":
      return "התחברות / הרשמה עם מייל וסיסמה";
    case "forgot":
      return "איפוס סיסמה";
    case "sent":
      return sentKind === "verify" ? "אימות כתובת מייל" : "איפוס סיסמה";
    case "details":
      return "פרטים אישיים";
    case "terms":
      return "הסכם שירות";
  }
}
