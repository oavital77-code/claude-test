"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { WEEKDAY_LABELS, slotHours, type SessionSlotDraft } from "@/lib/pricing/session";
import { requestSession } from "../actions";

interface RoomOption {
  id: string;
  label: string;
}

type Step = "slots" | "summary" | "submitted";

export function SessionRequestWizard({
  roomOptions,
  basePrice,
  baseHours,
}: {
  roomOptions: RoomOption[];
  basePrice: number;
  baseHours: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("slots");
  const [slots, setSlots] = useState<SessionSlotDraft[]>([]);
  const [draftRoomId, setDraftRoomId] = useState(roomOptions[0]?.id ?? "");
  const [draftWeekday, setDraftWeekday] = useState(0);
  const [draftStart, setDraftStart] = useState("09:00");
  const [draftEnd, setDraftEnd] = useState("11:00");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const weeklyHours = useMemo(() => slots.reduce((sum, s) => sum + slotHours(s), 0), [slots]);
  const monthlyPrice = basePrice;
  const hoursMatch = weeklyHours === baseHours;

  function addSlot() {
    setError(null);
    const room = roomOptions.find((r) => r.id === draftRoomId);
    if (!room) {
      setError("יש לבחור חדר");
      return;
    }
    if (draftEnd <= draftStart) {
      setError("שעת הסיום חייבת להיות אחרי שעת ההתחלה");
      return;
    }
    setSlots((prev) => [
      ...prev,
      { roomId: room.id, roomName: room.label, weekday: draftWeekday, startTime: draftStart, endTime: draftEnd },
    ]);
  }

  function removeSlot(index: number) {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    const result = await requestSession(slots);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStep("submitted");
  }

  if (step === "submitted") {
    return (
      <Card className="max-w-lg">
        <CardContent className="flex flex-col gap-3 p-6 text-center">
          <h2 className="text-lg font-medium">הבקשה נשלחה</h2>
          <p className="text-muted-foreground">
            הבקשה ממתינה לבדיקת זמינות ואישור הנהלת בקליניקה. תישלח הודעה כשתתקבל החלטה.
          </p>
          <Button onClick={() => router.push("/sessions")}>למסך הססיות שלי</Button>
        </CardContent>
      </Card>
    );
  }

  if (step === "summary") {
    return (
      <Card className="max-w-lg">
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-medium">סיכום הבקשה</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {slots.map((s, i) => (
              <li key={i}>
                {WEEKDAY_LABELS[s.weekday]} · {s.startTime}–{s.endTime} · {s.roomName}
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t pt-2 text-sm">
            <span>סה״כ שעות שבועיות</span>
            <span>{weeklyHours}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>מחיר חודשי (לפני מע״מ)</span>
            <span>{formatCurrency(monthlyPrice)}</span>
          </div>
          <p className="rounded-md bg-muted p-3 text-sm">
            לאחר האישור לא ניתן לשחרר מפגשים בודדים. ביטול המנוי — 30 יום מראש.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "שולח..." : "שליחת הבקשה"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep("slots")}>
              חזרה
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <Card className="max-w-md flex-1">
        <CardContent className="flex flex-col gap-3 p-6">
          <h2 className="text-lg font-medium">בחירת משבצות</h2>
          <p className="text-sm text-muted-foreground">
            יש לבחור משבצות שסך משכן {baseHours} שעות שבועיות בדיוק — {formatCurrency(basePrice)} לחודש (לפני מע״מ).
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="col-span-1 flex flex-col gap-1.5 sm:col-span-2">
              <Label>חדר</Label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={draftRoomId}
                onChange={(e) => setDraftRoomId(e.target.value)}
              >
                {roomOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>יום</Label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={draftWeekday}
                onChange={(e) => setDraftWeekday(Number(e.target.value))}
              >
                {WEEKDAY_LABELS.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="hidden sm:block" />
            <div className="flex flex-col gap-1.5">
              <Label>משעה</Label>
              <Input type="time" step={1800} value={draftStart} onChange={(e) => setDraftStart(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>עד שעה</Label>
              <Input type="time" step={1800} value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="button" variant="outline" onClick={addSlot}>
            + הוספת משבצת
          </Button>
        </CardContent>
      </Card>

      <Card className="max-w-md flex-1">
        <CardContent className="flex flex-col gap-3 p-6">
          <h2 className="text-lg font-medium">המשבצות שנבחרו</h2>
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">עדיין לא נבחרו משבצות.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {slots.map((s, i) => (
                <li key={i} className="flex items-center justify-between rounded-md border p-2">
                  <span>
                    {WEEKDAY_LABELS[s.weekday]} · {s.startTime}–{s.endTime} · {s.roomName}
                  </span>
                  <button
                    onClick={() => removeSlot(i)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between border-t pt-2 text-sm">
            <span>סה״כ שעות שבועיות</span>
            <span>
              {weeklyHours} מתוך {baseHours} נדרשות
            </span>
          </div>
          <div className="flex justify-between font-medium">
            <span>מחיר חודשי (לפני מע״מ)</span>
            <span>{formatCurrency(monthlyPrice)}</span>
          </div>
          {!hoursMatch && (
            <p className="text-xs text-muted-foreground">
              ססיה היא תמיד בהיקף קבוע של {baseHours} שעות שבועיות —{" "}
              {weeklyHours < baseHours ? "יש להוסיף עוד משבצות" : "יש להסיר משבצות"} עד שהסכום יהיה בדיוק {baseHours}.
            </p>
          )}
          <Button disabled={!hoursMatch} onClick={() => setStep("summary")}>
            המשך לסיכום
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
