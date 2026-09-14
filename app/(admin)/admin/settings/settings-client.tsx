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

      <DangerZone available={resetAvailable} />
    </div>
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
        `הושלם: נמחקו ${result.therapists} מטפלים, ${result.bookings} הזמנות, ` +
          `${result.rooms} חדרים ו-${result.branches} סניפים.`,
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
            כל ההזמנות, הכרטיסיות, מנויי הססיה, התשלומים, החסימות, החדרים והסניפים.
          </p>
          <p className="mb-2">
            <strong>שורדים:</strong> חשבונות האדמין, יומן הפעולות (כתיעוד), ותצורת החנות (מיפוי
            מוצרי Woo). המחירים וההגדרות חוזרים לברירות המחדל.
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
