"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Database } from "@/lib/supabase/types";
import { updateAppSettingAction, updateTierPriceAction } from "./actions";

type Tier = Database["public"]["Tables"]["punch_card_tiers"]["Row"];

export function SettingsClient({
  settings,
  tiers,
}: {
  settings: { key: string; value: number; label: string }[];
  tiers: Tier[];
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
    </div>
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
