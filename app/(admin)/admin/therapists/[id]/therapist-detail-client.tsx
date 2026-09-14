"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { formatDateHe, formatDateTimeHe } from "@/lib/time";
import { WEEKDAY_LABELS } from "@/lib/pricing/session";
import type { Database } from "@/lib/supabase/types";
import type { DerivedSlot, SkeddaGroup } from "@/lib/skedda-import/group";
import { deriveWeeklySlots } from "@/lib/skedda-import/group";
import type { SkeddaRosterEntry } from "@/lib/skedda-import/roster";
import {
  addSessionSlotAction,
  adjustPunchCardHoursAction,
  claimSkeddaOneOffBlocksAction,
  claimSkeddaSessionAction,
  completeDepositAction,
  grantBonusHoursAction,
  setTherapistStatus,
  updateTherapistProfile,
} from "./actions";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type PunchCard = Database["public"]["Tables"]["punch_cards"]["Row"];
type Payment = Database["public"]["Tables"]["payments"]["Row"];
type Subscription = Database["public"]["Tables"]["session_subscriptions"]["Row"];
type BookingRow = Pick<
  Database["public"]["Tables"]["bookings"]["Row"],
  "id" | "starts_at" | "ends_at" | "source" | "status"
> & { roomName: string };
type RoomOption = { id: string; name: string };

export function TherapistDetailClient({
  profile,
  adminNote,
  punchCards,
  bookings,
  payments,
  subscriptions,
  roomOptions,
  skeddaGroups,
  skeddaRosterMatch,
}: {
  profile: Profile;
  adminNote: string;
  punchCards: PunchCard[];
  bookings: BookingRow[];
  payments: Payment[];
  subscriptions: Subscription[];
  roomOptions: RoomOption[];
  skeddaGroups: SkeddaGroup[];
  skeddaRosterMatch: SkeddaRosterEntry | null;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <ProfileSection profile={profile} adminNote={adminNote} onSaved={() => router.refresh()} />

      {skeddaGroups.length > 0 && (
        <SkeddaImportSection
          userId={profile.id}
          groups={skeddaGroups}
          roomOptions={roomOptions}
          rosterMatch={skeddaRosterMatch}
          onChanged={() => router.refresh()}
        />
      )}

      <BonusHoursSection userId={profile.id} onGranted={() => router.refresh()} />

      <Section title="כרטיסיות">
        {punchCards.length === 0 ? (
          <Empty />
        ) : (
          punchCards.map((c) => (
            <PunchCardRow key={c.id} card={c} onCompleted={() => router.refresh()} onAdjusted={() => router.refresh()} />
          ))
        )}
      </Section>

      <Section title="ססיות">
        {subscriptions.length === 0 ? (
          <Empty />
        ) : (
          subscriptions.map((s) => (
            <SubscriptionRow
              key={s.id}
              subscription={s}
              roomOptions={roomOptions}
              onChanged={() => router.refresh()}
            />
          ))
        )}
      </Section>

      <Section title="הזמנות אחרונות">
        {bookings.length === 0 ? (
          <Empty />
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {bookings.map((b) => (
              <li key={b.id}>
                {b.roomName} · {formatDateTimeHe(new Date(b.starts_at))} · {b.source} · {b.status}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="תשלומים">
        {payments.length === 0 ? (
          <Empty />
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {payments.map((p) => (
              <li key={p.id}>
                {formatDateHe(new Date(p.created_at))} · {p.type} · {formatCurrency(p.amount_total)} · {p.status}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

type SkeddaKind = "one_off" | "session";

/**
 * קליטת מטפלת ותיקה מ-Skedda (ר' baclinica-spec.md / OPERATIONS.md).
 * הרשימה משותפת לכל המטפלים (לא מזוהה אוטומטית לפי שם — ר' דיון בסעיף
 * הקליטה) — אדמין בוחר ידנית אילו קבוצות שייכות למטפלת הזו בדיוק.
 *
 * "חד-פעמי" נקלט מיד (מוחק את הבלוק ויוצר הזמנה אמיתית בלי חיוב, כי היא
 * כבר שילמה ב-Skedda). "ססיה" רק פותח טופס לעריכת המשבצות ושליחה לתשלום
 * אמיתי (חוק ברזל #5) — הבלוק הישן *לא* נמחק כאן, ר' הערה בטופס עצמו.
 */
function SkeddaImportSection({
  userId,
  groups,
  roomOptions,
  rosterMatch,
  onChanged,
}: {
  userId: string;
  groups: SkeddaGroup[];
  roomOptions: RoomOption[];
  rosterMatch: SkeddaRosterEntry | null;
  onChanged: () => void;
}) {
  // התאמה לפי טלפון בלבד (מדויקת, לא לפי שם) — ר' lib/skedda-import/roster.ts.
  // מסמנת מראש רק קבוצות שה-label שלהן תואם *בדיוק* label שכבר נקשר לטלפון
  // הזה ב-Skedda (מ-bookings_1.csv, שם היה גם holder name וגם holder phone).
  const matchedLabels = new Set(rosterMatch?.labels ?? []);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(groups.filter((g) => matchedLabels.has(g.label)).map((g) => g.label)),
  );
  const [kindByLabel, setKindByLabel] = useState<Record<string, SkeddaKind>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sessionDraft, setSessionDraft] = useState<DerivedSlot[] | null>(null);

  const roomNameById = new Map(roomOptions.map((r) => [r.id, r.name]));
  const visibleGroups = groups.filter((g) => !dismissed.has(g.label));
  if (visibleGroups.length === 0) return null;

  function kindOf(group: SkeddaGroup): SkeddaKind {
    return kindByLabel[group.label] ?? (group.looksLikeSession ? "session" : "one_off");
  }

  function toggle(label: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  async function handleClaim() {
    const chosen = visibleGroups.filter((g) => selected.has(g.label));
    if (chosen.length === 0) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    const oneOff = chosen.filter((g) => kindOf(g) === "one_off");
    const sessionGroups = chosen.filter((g) => kindOf(g) === "session");

    if (oneOff.length > 0) {
      const blockIds = oneOff.flatMap((g) => g.blocks.map((b) => b.id));
      const result = await claimSkeddaOneOffBlocksAction({ userId, blockIds });
      if (!result.ok) {
        setLoading(false);
        setError(result.error);
        return;
      }
      setMessage(`נוצרו ${result.created} הזמנות חד-פעמיות${result.skipped ? ` (${result.skipped} דולגו)` : ""}.`);
      setDismissed((prev) => new Set([...prev, ...oneOff.map((g) => g.label)]));
      setSelected((prev) => {
        const next = new Set(prev);
        oneOff.forEach((g) => next.delete(g.label));
        return next;
      });
      onChanged();
    }

    if (sessionGroups.length > 0) {
      const blocks = sessionGroups.flatMap((g) => g.blocks);
      setSessionDraft(deriveWeeklySlots(blocks));
    }

    setLoading(false);
  }

  return (
    <Card className="border-violet-200 bg-violet-50/40">
      <CardHeader>
        <CardTitle className="text-base">קליטה מ-Skedda</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          בחרו אילו רשומות ישנות מ-Skedda שייכות למטפלת הזו. שני הסוגים נקלטים בלי תשלום נוסף — היא כבר
          שילמה על זה ב-Skedda. &quot;חד-פעמי&quot; נקלט מיד. &quot;ססיה קבועה&quot; פותח טופס לעריכת המשבצות
          ונכנס ישר לפעילה; החיוב החודשי הרגיל ממשיך כרגיל מהחודש הבא.
        </p>

        {rosterMatch && (
          <p className="rounded-md bg-violet-100 p-2 text-sm text-violet-900">
            📞 מספר הטלפון שלה מזוהה ב-Skedda בתור <strong>{rosterMatch.fullName}</strong>
            {rosterMatch.tags.length > 0 && ` (${rosterMatch.tags.join(", ")})`}
            {matchedLabels.size > 0 ? (
              <> — הקבוצות התואמות סומנו אוטומטית למטה.</>
            ) : (
              <>
                {" "}
                — אין לזה קישור ישיר לתור מסוים ב-Skedda (בדרך כלל כי מדובר בססיה, שם Skedda לא שומר את
                פרטי המחזיק). בדקו ידנית איזו קבוצה למטה שייכת לה, אם יש.
              </>
            )}
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {visibleGroups.map((group) => {
            const first = group.blocks[0];
            const last = group.blocks[group.blocks.length - 1];
            const roomNames = [...new Set(group.blocks.map((b) => roomNameById.get(b.room_id) ?? "?"))];
            const phoneMatched = matchedLabels.has(group.label);
            return (
              <li
                key={group.label}
                className={`flex flex-wrap items-center gap-3 rounded-md border p-2 text-sm ${
                  phoneMatched ? "border-violet-400 bg-violet-50" : "bg-background"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(group.label)}
                  onChange={() => toggle(group.label)}
                  className="size-4"
                />
                <span className="font-medium">{group.label}</span>
                {phoneMatched && <span className="text-xs font-medium text-violet-700">✓ טלפון תואם</span>}
                <span className="text-muted-foreground">
                  {roomNames.join(", ")} · {group.blocks.length} מופעים · {formatDateHe(new Date(first.starts_at))}–
                  {formatDateHe(new Date(last.starts_at))}
                </span>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={kindOf(group)}
                  onChange={(e) =>
                    setKindByLabel((prev) => ({ ...prev, [group.label]: e.target.value as SkeddaKind }))
                  }
                >
                  <option value="one_off">חד-פעמי (כרטיסייה)</option>
                  <option value="session">ססיה קבועה</option>
                </select>
              </li>
            );
          })}
        </ul>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-green-700">{message}</p>}

        <Button size="sm" onClick={handleClaim} disabled={loading || selected.size === 0} className="w-fit">
          {loading ? "קולט..." : "קליטת הנבחרים"}
        </Button>

        {sessionDraft && (
          <SkeddaSessionDraftForm
            userId={userId}
            initialSlots={sessionDraft}
            roomOptions={roomOptions}
            onCancel={() => setSessionDraft(null)}
            onCreated={(labels) => {
              setDismissed((prev) => new Set([...prev, ...labels]));
              setSessionDraft(null);
              onChanged();
            }}
            claimedLabels={visibleGroups.filter((g) => selected.has(g.label) && kindOf(g) === "session").map((g) => g.label)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SkeddaSessionDraftForm({
  userId,
  initialSlots,
  roomOptions,
  claimedLabels,
  onCancel,
  onCreated,
}: {
  userId: string;
  initialSlots: DerivedSlot[];
  roomOptions: RoomOption[];
  claimedLabels: string[];
  onCancel: () => void;
  onCreated: (labels: string[]) => void;
}) {
  const [slots, setSlots] = useState<DerivedSlot[]>(initialSlots);
  const [startDate, setStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateSlot(index: number, patch: Partial<DerivedSlot>) {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeSlot(index: number) {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }

  function addSlot() {
    setSlots((prev) => [
      ...prev,
      { roomId: roomOptions[0]?.id ?? "", weekday: 0, startTime: "09:00", endTime: "10:00" },
    ]);
  }

  async function handleCreate() {
    if (slots.length === 0) {
      setError("יש להשאיר לפחות משבצת אחת");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await claimSkeddaSessionAction({
      userId,
      slots: slots.map((s) => ({ roomId: s.roomId, weekday: s.weekday, startTime: s.startTime, endTime: s.endTime })),
      startDate: startDate || null,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated(claimedLabels);
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background p-3">
      <p className="text-sm text-muted-foreground">
        המשבצות הבאות הוצעו מתוך התאריכים ב-Skedda — אפשר לערוך לפני היצירה. היא כבר שילמה על זה
        ב-Skedda, אז הססיה תיווצר ישר כ<strong>פעילה</strong> — בלי תשלום ראשוני. החיוב החודשי הרגיל
        (600₪+מע&quot;מ) ממשיך כרגיל מהחודש הבא. הבלוק הישן ב-Skedda יימחק אוטומטית מיד.
      </p>

      {slots.map((slot, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">חדר</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={slot.roomId}
              onChange={(e) => updateSlot(i, { roomId: e.target.value })}
            >
              {roomOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">יום</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={slot.weekday}
              onChange={(e) => updateSlot(i, { weekday: Number(e.target.value) })}
            >
              {WEEKDAY_LABELS.map((label, idx) => (
                <option key={idx} value={idx}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">משעה</Label>
            <Input
              type="time"
              step={1800}
              value={slot.startTime}
              onChange={(e) => updateSlot(i, { startTime: e.target.value })}
              className="w-28"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">עד שעה</Label>
            <Input
              type="time"
              step={1800}
              value={slot.endTime}
              onChange={(e) => updateSlot(i, { endTime: e.target.value })}
              className="w-28"
            />
          </div>
          <Button size="sm" variant="ghost" onClick={() => removeSlot(i)}>
            הסרה
          </Button>
        </div>
      ))}

      <Button size="sm" variant="outline" onClick={addSlot} className="w-fit">
        + הוספת משבצת
      </Button>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">תאריך התחלה (ריק = היום)</Label>
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button size="sm" onClick={handleCreate} disabled={loading}>
          {loading ? "יוצר..." : "יצירת ססיה ושליחת תשלום"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={loading}>
          ביטול
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Empty() {
  return <p className="text-sm text-muted-foreground">אין נתונים.</p>;
}

function ProfileSection({
  profile,
  adminNote,
  onSaved,
}: {
  profile: Profile;
  adminNote: string;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [email, setEmail] = useState(profile.email);
  const [profession, setProfession] = useState(profile.profession ?? "");
  const [businessNumber, setBusinessNumber] = useState(profile.business_number ?? "");
  const [doorCode, setDoorCode] = useState(profile.door_code ?? "");
  const [adminNotes, setAdminNotes] = useState(adminNote);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setLoading(true);
    setError(null);
    const result = await updateTherapistProfile(profile.id, {
      full_name: fullName,
      email,
      profession,
      business_number: businessNumber,
      door_code: doorCode,
      admin_notes: adminNotes,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  async function handleToggleStatus() {
    setLoading(true);
    setError(null);
    const result = await setTherapistStatus(profile.id, profile.status === "active" ? "suspended" : "active");
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>פרטים</span>
          <Button size="sm" variant={profile.status === "active" ? "destructive" : "default"} onClick={handleToggleStatus}>
            {profile.status === "active" ? "השעיה" : "הפעלה מחדש"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>שם מלא</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>מייל</Label>
          <Input dir="ltr" className="text-left" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>תחום טיפול</Label>
          <Input value={profession} onChange={(e) => setProfession(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>מספר עוסק/ח.פ</Label>
          <Input dir="ltr" className="text-left" value={businessNumber} onChange={(e) => setBusinessNumber(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>קוד דלת</Label>
          <Input dir="ltr" className="text-left" value={doorCode} onChange={(e) => setDoorCode(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>הערות פנימיות (לא נחשף למטפל)</Label>
          <Input value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} />
        </div>
        {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
        <Button size="sm" onClick={handleSave} disabled={loading} className="w-fit">
          {loading ? "שומר..." : "שמירה"}
        </Button>
      </CardContent>
    </Card>
  );
}

function BonusHoursSection({ userId, onGranted }: { userId: string; onGranted: () => void }) {
  const [hours, setHours] = useState("1");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGrant() {
    const hoursNum = Number(hours);
    if (!hoursNum || hoursNum <= 0) {
      setError("יש להזין מספר שעות תקין");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await grantBonusHoursAction(userId, hoursNum, note);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNote("");
    onGranted();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">שעות מתנה</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label>שעות</Label>
          <Input type="number" min={0.5} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} className="w-24" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label>הערה</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button size="sm" onClick={handleGrant} disabled={loading}>
          {loading ? "מעניק..." : "הענקה"}
        </Button>
        {error && <p className="w-full text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function PunchCardRow({
  card,
  onCompleted,
  onAdjusted,
}: {
  card: PunchCard;
  onCompleted: () => void;
  onAdjusted: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [delta, setDelta] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const depositShort = card.deposit_remaining < card.deposit_amount;

  async function handleComplete() {
    setLoading(true);
    await completeDepositAction(card.id);
    setLoading(false);
    onCompleted();
  }

  async function handleAdjust(sign: 1 | -1) {
    const hours = Number(delta);
    if (!hours || hours <= 0) {
      setError("יש להזין מספר שעות תקין");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await adjustPunchCardHoursAction(card.id, hours * sign, "עדכון ידני ע\"י אדמין");
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onAdjusted();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <p>
            {card.hours_remaining}/{card.hours_purchased} שעות · תוקף {formatDateHe(new Date(card.expires_at))}
            {!card.active && " · לא פעילה"}
          </p>
          <p className="text-muted-foreground">
            פיקדון: {formatCurrency(card.deposit_remaining)}/{formatCurrency(card.deposit_amount)}
          </p>
        </div>
        {depositShort && (
          <Button size="sm" variant="outline" onClick={handleComplete} disabled={loading}>
            {loading ? "משלים..." : "השלמת פיקדון"}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0.5}
          step={0.5}
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          className="w-20"
        />
        <Button size="sm" variant="outline" onClick={() => handleAdjust(1)} disabled={loading}>
          + הוספת שעות
        </Button>
        <Button size="sm" variant="ghost" onClick={() => handleAdjust(-1)} disabled={loading}>
          − הפחתת שעות
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SubscriptionRow({
  subscription,
  roomOptions,
  onChanged,
}: {
  subscription: Subscription;
  roomOptions: RoomOption[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [roomId, setRoomId] = useState(roomOptions[0]?.id ?? "");
  const [weekday, setWeekday] = useState(0);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAddSlot = subscription.status === "active" || subscription.status === "pending_cancellation";

  async function handleAddSlot() {
    setLoading(true);
    setError(null);
    const result = await addSessionSlotAction({
      subscriptionId: subscription.id,
      roomId,
      weekday,
      startTime,
      endTime,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    onChanged();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
      <div className="flex items-center justify-between">
        <p>
          {subscription.weekly_hours} ש׳/שבוע · {formatCurrency(subscription.monthly_price)}/חודש · סטטוס:{" "}
          {subscription.status}
        </p>
        {canAddSlot && (
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            {open ? "סגירה" : "+ הוספת משבצת"}
          </Button>
        )}
      </div>

      {open && (
        <div className="flex flex-wrap items-end gap-2 rounded-md bg-muted/40 p-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">חדר</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            >
              {roomOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">יום</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
            >
              {WEEKDAY_LABELS.map((label, i) => (
                <option key={i} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">משעה</Label>
            <Input type="time" step={1800} value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-28" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">עד שעה</Label>
            <Input type="time" step={1800} value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-28" />
          </div>
          <Button size="sm" onClick={handleAddSlot} disabled={loading || !roomId}>
            {loading ? "שומר..." : "הוספה"}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
