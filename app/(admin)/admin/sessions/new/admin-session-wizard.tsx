"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { formatDateHe } from "@/lib/time";
import { todayInIsrael } from "@/lib/availability/grid";
import { WEEKDAY_LABELS, slotHours, type SessionSlotDraft } from "@/lib/pricing/session";
import { adminCreateSessionAction } from "../actions";

/** אפשרויות טווח ההתחייבות — ר' 20260901000002_session_commitment_term.sql. */
const TERM_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "חודש" },
  { value: 3, label: "3 חודשים" },
  { value: 6, label: "חצי שנה" },
  { value: 12, label: "שנה" },
];

interface RoomOption {
  id: string;
  label: string;
}

interface TherapistOption {
  id: string;
  full_name: string;
  phone: string;
}

type Step = "form" | "submitted";

export function AdminSessionWizard({
  roomOptions,
  therapists,
  basePrice,
  baseHours,
}: {
  roomOptions: RoomOption[];
  therapists: TherapistOption[];
  basePrice: number;
  baseHours: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [slots, setSlots] = useState<SessionSlotDraft[]>([]);
  const [draftRoomId, setDraftRoomId] = useState(roomOptions[0]?.id ?? "");
  const [draftWeekday, setDraftWeekday] = useState(0);
  const [draftStart, setDraftStart] = useState("09:00");
  const [draftEnd, setDraftEnd] = useState("11:00");
  const [startDate, setStartDate] = useState(todayInIsrael());
  const [termMonths, setTermMonths] = useState<string>("");
  const [therapistQuery, setTherapistQuery] = useState("");
  const [selectedTherapistId, setSelectedTherapistId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const weeklyHours = useMemo(() => slots.reduce((sum, s) => sum + slotHours(s), 0), [slots]);
  const hoursMatch = weeklyHours === baseHours;

  const filteredTherapists = therapists
    .filter((t) => t.full_name.includes(therapistQuery) || t.phone.includes(therapistQuery))
    .slice(0, 8);

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
    setError(null);
    if (!selectedTherapistId) {
      setError("יש לבחור מטפל/ת");
      return;
    }
    if (!hoursMatch) {
      setError(`ססיה היא תמיד בהיקף קבוע של ${baseHours} שעות שבועיות`);
      return;
    }
    setLoading(true);
    const result = await adminCreateSessionAction(
      selectedTherapistId,
      slots,
      startDate,
      termMonths ? Number(termMonths) : null,
    );
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
          <h2 className="text-lg font-medium">הססיה נקבעה</h2>
          <p className="text-muted-foreground">
            הססיה נוצרה ישירות במצב &quot;ממתין לתשלום&quot; — קישור תשלום נשלח למטפל/ת במייל.
          </p>
          <Button onClick={() => router.push("/admin/sessions")}>למסך בקשות הססיה</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <Card className="max-w-md flex-1">
        <CardContent className="flex flex-col gap-3 p-6">
          <h2 className="text-lg font-medium">מטפל/ת ומשבצות</h2>

          <div className="flex flex-col gap-1.5">
            <Label>מטפל/ת</Label>
            <Input
              placeholder="חיפוש לפי שם או טלפון"
              value={therapistQuery}
              onChange={(e) => {
                setTherapistQuery(e.target.value);
                setSelectedTherapistId("");
              }}
            />
            {therapistQuery && !selectedTherapistId && (
              <ul className="max-h-32 overflow-y-auto rounded-md border text-sm">
                {filteredTherapists.map((t) => (
                  <li
                    key={t.id}
                    className="cursor-pointer p-1.5 hover:bg-muted"
                    onClick={() => {
                      setSelectedTherapistId(t.id);
                      setTherapistQuery(t.full_name);
                    }}
                  >
                    {t.full_name} · {t.phone}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            יש לבחור משבצות שסך משכן {baseHours} שעות שבועיות בדיוק — {formatCurrency(basePrice)} לחודש (לפני מע״מ).
            לא מתבצעת בדיקת התנגשות — קביעה חופשית.
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
          <Button type="button" variant="outline" onClick={addSlot}>
            + הוספת משבצת
          </Button>

          <div className="flex flex-col gap-1.5">
            <Label>תאריך התחלה</Label>
            <Input
              type="date"
              value={startDate}
              min={todayInIsrael()}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              המפגשים הראשונים ישובצו החל מ-{formatDateHe(new Date(`${startDate}T00:00:00Z`))}.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>טווח התחייבות</Label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={termMonths}
              onChange={(e) => setTermMonths(e.target.value)}
            >
              <option value="">ללא הגבלת טווח</option>
              {TERM_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  לסגור ל{t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              בסיום הטווח לא מתבצע חידוש אוטומטי — נדרש אישור מפורש דרך /admin/sessions כדי להמשיך. התשלום
              החודשי הרגיל בתוך הטווח ממשיך כרגיל.
            </p>
          </div>
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
                  <button onClick={() => removeSlot(i)} className="text-muted-foreground hover:text-destructive">
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
            <span>{formatCurrency(basePrice)}</span>
          </div>
          {!hoursMatch && (
            <p className="text-xs text-muted-foreground">
              ססיה היא תמיד בהיקף קבוע של {baseHours} שעות שבועיות —{" "}
              {weeklyHours < baseHours ? "יש להוסיף עוד משבצות" : "יש להסיר משבצות"} עד שהסכום יהיה בדיוק {baseHours}.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={!hoursMatch || loading} onClick={handleSubmit}>
            {loading ? "קובע..." : "קביעת הססיה"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
