"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { previewOverrunAction, recordOverrunAction, type PreviewResult } from "./actions";

export interface BookingOption {
  id: string;
  label: string;
}

export function OverrunClient({ bookingOptions }: { bookingOptions: BookingOption[] }) {
  const [bookingId, setBookingId] = useState(bookingOptions[0]?.id ?? "");
  const [minutes, setMinutes] = useState("15");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handlePreview() {
    setResult(null);
    const minutesNum = Number(minutes);
    if (!bookingId || !minutesNum || minutesNum <= 0) return;
    setLoading(true);
    const r = await previewOverrunAction(bookingId, minutesNum);
    setLoading(false);
    setPreview(r);
  }

  async function handleConfirm() {
    setLoading(true);
    setResult(null);
    const r = await recordOverrunAction(bookingId, Number(minutes), note);
    setLoading(false);
    if (!r.ok) {
      setResult(r.error);
      return;
    }
    setResult(
      r.source === "deposit"
        ? "נרשם וקוזז מהפיקדון."
        : r.source === "charge_succeeded"
          ? "נרשם וחויב בהצלחה בכרטיס השמור."
          : "נרשם, אך חיוב הכרטיס נכשל — המטפל/ת הושעה עד להסדרה.",
    );
    setPreview(null);
  }

  return (
    <Card className="max-w-lg">
      <CardContent className="flex flex-col gap-3 p-6">
        <div className="flex flex-col gap-1.5">
          <Label>הזמנה</Label>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={bookingId}
            onChange={(e) => {
              setBookingId(e.target.value);
              setPreview(null);
            }}
          >
            {bookingOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>דקות חריגה</Label>
          <Input
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value);
              setPreview(null);
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>הערה</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <Button variant="outline" onClick={handlePreview} disabled={loading || !bookingId}>
          תצוגה מקדימה
        </Button>

        {preview && preview.ok && (
          <div className="rounded-md bg-muted p-3 text-sm">
            <p>שעות מעוגלות: {preview.hours}</p>
            <p>תעריף: {formatCurrency(preview.pricePerHour)}/שעה</p>
            <p className="font-medium">סכום לחיוב: {formatCurrency(preview.amount)}</p>
            <p className="text-muted-foreground">
              {preview.needsCharge
                ? `פיקדון זמין (${formatCurrency(preview.depositAvailable)}) אינו מספיק — יחויב הכרטיס השמור`
                : "יכוסה מהפיקדון"}
            </p>
          </div>
        )}
        {preview && !preview.ok && <p className="text-sm text-destructive">{preview.error}</p>}

        {result && <p className="text-sm">{result}</p>}

        <Button onClick={handleConfirm} disabled={loading || !bookingId}>
          {loading ? "מבצע..." : "אישור רישום החריגה"}
        </Button>
      </CardContent>
    </Card>
  );
}
