"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Database } from "@/lib/supabase/types";
import { RESET_CONFIRMATION_PHRASE } from "@/lib/system-reset";
import {
  updateAppSettingAction,
  updateTierPriceAction,
  resetSystemToZeroAction,
  importScheduleAction,
  type ScheduleImportResult,
} from "./actions";

type Tier = Database["public"]["Tables"]["punch_card_tiers"]["Row"];

export function SettingsClient({
  settings,
  tiers,
  resetAvailable,
}: {
  settings: { key: string; value: number; label: string }[];
  tiers: Tier[];
  resetAvailable: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">מדיניות ותמחור כללי</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {settings.map((s) => (
            <SettingField key={s.key} settingKey={s.key} label={s.label} initialValue={s.value} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">מדרגות כרטיסייה</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {tiers.map((t) => (
            <TierField key={t.id} tier={t} />
          ))}
        </CardContent>
      </Card>

      <ScheduleImportCard />

      <DangerZone available={resetAvailable} />
    </div>
  );
}

/** ייבוא לו״ז מקובץ CSV → חסימות חדר, עם תצוגה מקדימה לפני כתיבה. */
function ScheduleImportCard() {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScheduleImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<number | null>(null);

  async function run(text: string, dryRun: boolean) {
    setLoading(true);
    setError(null);
    try {
      const result = await importScheduleAction(text, dryRun);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (dryRun) {
        setPreview(result);
      } else {
        setCommitted(result.inserted);
        setPreview(null);
        setFileText(null);
        setFileName(null);
        router.refresh();
      }
    } catch {
      setError("הפעולה נכשלה. ייתכן שהקובץ גדול מדי או פגום.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCommitted(null);
    setPreview(null);
    setError(null);
    const text = await file.text();
    setFileName(file.name);
    setFileText(text);
    await run(text, true);
  }

  const ok = preview?.ok === true ? preview : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ייבוא לו״ז מקובץ</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="text-sm text-muted-foreground">
          <p className="mb-1">
            העלאת קובץ <strong>CSV</strong> עם העמודות: שם מטפל/ת, מייל, חדר, תאריך, שעה (ואם יש —
            שעת סיום). כל שורה הופכת ל<strong>חסימת חדר</strong> בלוח — בדיוק כמו הייבוא מ-Skedda —
            ואפשר לשייך אותה למטפל/ת אחר כך דרך הכרטיס שלה.
          </p>
          <p className="text-xs">
            מאקסל: קובץ → שמירה בשם → <strong>CSV UTF-8</strong>. תאריך בפורמט 03/09/2026, שעה 09:00.
          </p>
        </div>

        <label className="w-fit cursor-pointer rounded-button border border-dashed px-3 py-2 text-sm hover:bg-muted">
          {loading ? "מעבד..." : fileName ? `קובץ: ${fileName}` : "בחירת קובץ CSV"}
          <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={handleFile} disabled={loading} />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {committed !== null && (
          <p className="rounded-md border border-emerald-600/40 bg-emerald-50 p-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            הייבוא הושלם: נוספו {committed} משבצות ללוח.
          </p>
        )}

        {ok && (
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <p className="text-sm">
              נקראו <strong>{ok.totalRows}</strong> שורות · מוכנות לייבוא:{" "}
              <strong className="text-emerald-700 dark:text-emerald-400">{ok.readyCount}</strong>
              {ok.parseErrors.length + ok.conflicts.length > 0 && (
                <>
                  {" "}
                  · ידולגו:{" "}
                  <strong className="text-destructive">
                    {ok.parseErrors.length + ok.conflicts.length}
                  </strong>
                </>
              )}
            </p>

            {ok.unknownRooms.length > 0 && (
              <p className="text-xs text-destructive">
                חדרים שלא נמצאו במערכת: {ok.unknownRooms.join(", ")} — צריך ליצור אותם קודם במסך
                &quot;סניפים וחדרים&quot;, או לתקן את השם בקובץ.
              </p>
            )}

            {(ok.parseErrors.length > 0 || ok.conflicts.length > 0) && (
              <ul className="max-h-40 overflow-y-auto text-xs text-muted-foreground">
                {[...ok.parseErrors, ...ok.conflicts].slice(0, 30).map((e, i) => (
                  <li key={`${e.rowNumber}-${i}`}>
                    שורה {e.rowNumber}: {e.message}
                  </li>
                ))}
              </ul>
            )}

            {ok.readyCount > 0 && fileText && (
              <Button size="sm" className="w-fit" disabled={loading} onClick={() => run(fileText, false)}>
                {loading ? "מייבא..." : `ייבוא ${ok.readyCount} משבצות ללוח`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** ⚠️ אזור מסוכן — איפוס המערכת למצב אפס. בלתי הפיך. */
function DangerZone({ available }: { available: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const phraseMatches = typed.trim() === RESET_CONFIRMATION_PHRASE;

  async function handleReset() {
    setLoading(true);
    setError(null);
    try {
      const result = await resetSystemToZeroAction(typed.trim());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(
        `הושלם: נמחקו ${result.therapists} מטפלים, ${result.bookings} הזמנות ` +
          `ו-${result.blocks} חסימות. הסניפים והחדרים נשארו על כנם.`,
      );
      setOpen(false);
      setTyped("");
      router.refresh();
    } catch {
      setError("האיפוס נכשל. ייתכן ששום דבר לא נמחק — בדוק את מצב המערכת לפני ניסיון נוסף.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-base text-destructive">אזור מסוכן — איפוס למצב אפס</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="text-sm text-muted-foreground">
          <p className="mb-2">
            מוחק <strong>לצמיתות ובלי אפשרות שחזור</strong>: כל המטפלים וחשבונות ההתחברות שלהם,
            כל ההזמנות, הכרטיסיות, מנויי הססיה, התשלומים וחסימות הלוח.
          </p>
          <p className="mb-2">
            <strong>לא נוגע ב:</strong> הסניפים והחדרים · חשבונות האדמין · יומן הפעולות (כתיעוד) ·
            תצורת החנות (מיפוי מוצרי Woo). המחירים וההגדרות חוזרים לברירות המחדל.
          </p>
          <p>מיועד לניקוי לפני כניסת משתמשים אמיתיים בלבד.</p>
        </div>

        {done && (
          <p className="rounded-md border border-emerald-600/40 bg-emerald-50 p-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            {done}
          </p>
        )}

        {!available ? (
          <p className="rounded-md border bg-muted/50 p-3 text-sm">
            🔒 <strong>האיפוס נעול.</strong> כבר בוצע במערכת תשלום אמיתי ע״י משתמש/ת — מרגע זה
            המערכת נחשבת פעילה ולא ניתן למחוק אותה מכאן.
          </p>
        ) : !open ? (
          <Button variant="outline" className="w-fit text-destructive" onClick={() => setOpen(true)}>
            איפוס המערכת למצב אפס
          </Button>
        ) : (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/50 p-3">
            <Label>
              לאישור, הקלד/י בדיוק: <strong>{RESET_CONFIRMATION_PHRASE}</strong>
            </Label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={RESET_CONFIRMATION_PHRASE}
              className="max-w-xs"
              autoComplete="off"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={!phraseMatches || loading}
                onClick={handleReset}
              >
                {loading ? "מוחק..." : "כן, למחוק הכל"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={loading}
                onClick={() => {
                  setOpen(false);
                  setTyped("");
                  setError(null);
                }}
              >
                ביטול
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SettingField({
  settingKey,
  label,
  initialValue,
}: {
  settingKey: string;
  label: string;
  initialValue: number;
}) {
  const [value, setValue] = useState(String(initialValue));
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSaved(false);
    const result = await updateAppSettingAction(settingKey, Number(value));
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          type="number"
          step="any"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
        />
        <Button size="sm" variant="outline" onClick={handleSave} disabled={loading}>
          {loading ? "שומר..." : "שמירה"}
        </Button>
      </div>
      {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">נשמר</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

function TierField({ tier }: { tier: Tier }) {
  const [price, setPrice] = useState(String(tier.price_per_hour));
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSaved(false);
    const result = await updateTierPriceAction(tier.id, Number(price));
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <Label>
          {tier.hours} שעות (פיקדון {tier.deposit_hours} ש׳)
        </Label>
        <Input type="number" step="any" value={price} onChange={(e) => { setPrice(e.target.value); setSaved(false); }} className="w-32" />
      </div>
      <Button size="sm" variant="outline" onClick={handleSave} disabled={loading}>
        {loading ? "שומר..." : "שמירה"}
      </Button>
      {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">נשמר</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
