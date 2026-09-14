"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateHe } from "@/lib/time";
import { updateOwnProfile } from "./actions";

interface Props {
  fullName: string;
  profession: string;
  businessNumber: string;
  phone: string;
  email: string;
  nationalId: string | null;
  doorCode: string | null;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  createdAt: string | null;
}

/** שדה לקריאה בלבד — מוצג עם מנעול והסבר למה אי אפשר לערוך אותו כאן. */
function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="flex items-center gap-1.5 text-muted-foreground">
        <Lock className="size-3.5" aria-hidden="true" />
        {label}
      </Label>
      <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm">{value}</p>
    </div>
  );
}

export function ProfileClient({
  fullName,
  profession,
  businessNumber,
  phone,
  email,
  nationalId,
  doorCode,
  termsAcceptedAt,
  termsVersion,
  createdAt,
}: Props) {
  const [values, setValues] = useState({
    full_name: fullName,
    profession,
    business_number: businessNumber,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    values.full_name !== fullName ||
    values.profession !== profession ||
    values.business_number !== businessNumber;

  function set(key: keyof typeof values, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateOwnProfile(values);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">פרטים שניתן לעדכן</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="full_name">שם מלא</Label>
            <Input id="full_name" value={values.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profession">תחום טיפול</Label>
            <Input id="profession" value={values.profession} onChange={(e) => set("profession", e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="business_number">מספר עוסק / ח.פ</Label>
            <Input
              id="business_number"
              inputMode="numeric"
              placeholder="9 ספרות"
              value={values.business_number}
              onChange={(e) => set("business_number", e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">הפרטים נשמרו.</p>}

          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving || !dirty}>
              {saving ? "שומר..." : "שמירה"}
            </Button>
            {dirty && !saving && <span className="text-xs text-muted-foreground">יש שינויים שלא נשמרו</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">פרטי זהות</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            שדות אלה מזהים אתכם מול רכישות שבוצעו באתר בקליניקה, ולכן לא ניתנים לעריכה עצמית. לשינוי — יש לפנות
            להנהלה.
          </p>
          <LockedField label="טלפון" value={phone} />
          <LockedField label="כתובת מייל" value={email} />
          {nationalId && <LockedField label="תעודת זהות" value={nationalId} />}
          {doorCode && <LockedField label="קוד דלת" value={doorCode} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">חשבון</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          {createdAt && <p>נרשמת ב-{formatDateHe(new Date(createdAt))}</p>}
          {termsAcceptedAt && (
            <p>
              תקנון השירות אושר ב-{formatDateHe(new Date(termsAcceptedAt))}
              {termsVersion ? ` (גרסה ${termsVersion})` : ""}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
