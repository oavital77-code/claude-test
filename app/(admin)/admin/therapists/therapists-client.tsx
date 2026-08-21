"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateHe } from "@/lib/time";
import type { Database } from "@/lib/supabase/types";
import { createDemoTherapistAction } from "./actions";

type TherapistRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "phone" | "email" | "status" | "created_at"
>;

const STATUS_LABELS: Record<TherapistRow["status"], string> = {
  active: "פעיל",
  suspended: "מושעה",
  archived: "בארכיון",
};

export function TherapistsClient({ therapists }: { therapists: TherapistRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return therapists;
    return therapists.filter(
      (t) => t.full_name.includes(q) || t.phone.includes(q) || t.email.includes(q),
    );
  }, [therapists, query]);

  return (
    <div className="flex flex-col gap-3">
      <DemoTherapistSection />

      <Input
        placeholder="חיפוש לפי שם, טלפון או מייל"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-right">
            <tr>
              <th className="p-2">שם</th>
              <th className="p-2">טלפון</th>
              <th className="p-2">מייל</th>
              <th className="p-2">סטטוס</th>
              <th className="p-2">הצטרפות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                  {therapists.length === 0 ? "אין עדיין מטפלים רשומים" : "אין תוצאות לחיפוש"}
                </td>
              </tr>
            ) : null}
            {filtered.map((t) => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="p-2">
                  <Link href={`/admin/therapists/${t.id}`} className="text-primary underline-offset-4 hover:underline">
                    {t.full_name}
                  </Link>
                </td>
                <td className="p-2" dir="ltr">
                  {t.phone}
                </td>
                <td className="p-2" dir="ltr">
                  {t.email}
                </td>
                <td className="p-2">{STATUS_LABELS[t.status]}</td>
                <td className="p-2">{formatDateHe(new Date(t.created_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const emptyDemo = { full_name: "", email: "", phone: "", profession: "", demo_hours: "10" };

function DemoTherapistSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(emptyDemo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    const result = await createDemoTherapistAction({
      ...values,
      demo_hours: Number(values.demo_hours) || 0,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLoginUrl(result.loginUrl);
    setValues(emptyDemo);
    router.refresh();
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="w-fit" onClick={() => setOpen(true)}>
        + הוספת משתמש דמו
      </Button>
    );
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">משתמש דמו</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          יוצר חשבון מטפל אמיתי בלי הרשמה עצמאית, עם שעות כרטיסייה חינמיות (בלי
          PayPlus בכלל) — ומחזיר קישור התחברות חד-פעמי כדי שתוכל להיכנס ולבדוק
          את המערכת בתור המטפל הזה.
        </p>

        {loginUrl ? (
          <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-medium">המשתמש נוצר בהצלחה!</p>
            <p className="text-xs text-muted-foreground">
              קישור ההתחברות תקף לשימוש חד-פעמי — הכי טוב לפתוח אותו בחלון גלישה
              בסתר (Incognito) כדי לא לצאת מהחשבון שלך כאדמין:
            </p>
            <a
              href={loginUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all text-sm text-primary underline"
            >
              {loginUrl}
            </a>
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => {
                setLoginUrl(null);
                setOpen(false);
              }}
            >
              סגירה
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>שם מלא</Label>
                <Input
                  value={values.full_name}
                  onChange={(e) => setValues({ ...values, full_name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>מייל</Label>
                <Input
                  dir="ltr"
                  className="text-left"
                  type="email"
                  value={values.email}
                  onChange={(e) => setValues({ ...values, email: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>טלפון</Label>
                <Input
                  dir="ltr"
                  className="text-left"
                  placeholder="05X-XXXXXXX"
                  value={values.phone}
                  onChange={(e) => setValues({ ...values, phone: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>תחום טיפול</Label>
                <Input
                  value={values.profession}
                  onChange={(e) => setValues({ ...values, profession: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>שעות חינמיות</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={values.demo_hours}
                  onChange={(e) => setValues({ ...values, demo_hours: e.target.value })}
                  className="w-32"
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={loading}>
                {loading ? "יוצר..." : "יצירת משתמש דמו"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                ביטול
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
