"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { TimeSelect } from "@/components/ui/time-select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { formatDateHe, formatTimeHe } from "@/lib/time";
import { WEEKDAY_LABELS } from "@/lib/pricing/session";
import { dayBoundaries, israelDateTime } from "@/lib/availability/grid";
import type { Database } from "@/lib/supabase/types";
import {
  addSlotAction,
  checkSlotConflictsAction,
  type SlotConflict,
  cancelOccurrenceAction,
  cancelSessionAction,
  changeSlotAction,
  moveOccurrenceAction,
  removeSlotAction,
  type ManageResult,
} from "./actions";
import { setSessionPriceAction } from "../actions";
import { claimSkeddaSessionAction } from "../../therapists/[id]/actions";

type Slot = Database["public"]["Tables"]["session_slots"]["Row"];
type RoomOption = { id: string; name: string };

export type ManagedSubscription = {
  id: string;
  user_id: string;
  status: string;
  weekly_hours: number;
  monthly_price: number;
  start_date: string | null;
  effective_end_date: string | null;
  slots: Slot[];
  upcoming: { id: string; room_id: string; starts_at: string; ends_at: string; admin_note: string | null }[];
};

export type ManagedTherapist = { userId: string; name: string; subscriptions: ManagedSubscription[] };

type SlotDraft = { roomId: string; weekday: number; startTime: string; endTime: string };

function hhmm(t: string) {
  return t.slice(0, 5);
}

function dateLabel(d: string) {
  return formatDateHe(new Date(`${d}T12:00:00`));
}

/** ISO של תאריך+שעה בשעון ישראל — דרך israelDateTime (נכון גם ביום מעבר שעון). */
function israelIso(date: string, time: string) {
  return israelDateTime(date, time).toISOString();
}

export function ManageSessionsClient({
  therapists,
  roomOptions,
  allTherapists,
  today,
}: {
  therapists: ManagedTherapist[];
  roomOptions: RoomOption[];
  allTherapists: { id: string; name: string; phone: string }[];
  today: string;
}) {
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const roomName = useMemo(() => new Map(roomOptions.map((r) => [r.id, r.name])), [roomOptions]);

  const filtered = therapists.filter((t) => t.name.includes(query.trim()));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="חיפוש מטפל/ת"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <Button variant={showNew ? "outline" : "default"} onClick={() => setShowNew((v) => !v)}>
          {showNew ? "סגירה" : "+ ססיה חדשה"}
        </Button>
        <span className="text-sm text-muted-foreground">{therapists.length} מטפלים עם ססיה</span>
      </div>

      {showNew && (
        <NewSessionForm
          allTherapists={allTherapists}
          roomOptions={roomOptions}
          today={today}
          onDone={() => setShowNew(false)}
        />
      )}

      {filtered.length === 0 && <p className="text-sm text-muted-foreground">אין תוצאות.</p>}

      {filtered.map((t) => (
        <Card key={t.userId}>
          <CardContent className="flex flex-col gap-3 p-4">
            <Link href={`/admin/therapists/${t.userId}`} className="font-semibold text-primary hover:underline">
              {t.name}
            </Link>
            {t.subscriptions.map((s) => (
              <SubscriptionBlock key={s.id} sub={s} roomOptions={roomOptions} roomName={roomName} today={today} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(fn: () => Promise<ManageResult>, onOk?: () => void) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.message) setNotice(res.message);
    onOk?.();
    router.refresh();
  }

  return { busy, error, notice, run };
}

/**
 * בדיקת התנגשויות לפני שמירה. אין התנגשויות → שומר מיד. יש → מציג רשימה
 * ומחכה ל"לשמור בכל זאת" (מפגש מתנגש פשוט לא נקבע; שום הזמנה לא נדרסת).
 */
function useConflictGuard() {
  const [pending, setPending] = useState<{ conflicts: SlotConflict[]; proceed: () => void } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  async function guard(input: unknown, proceed: () => void) {
    setChecking(true);
    setCheckError(null);
    setPending(null);
    const res = await checkSlotConflictsAction(input);
    setChecking(false);
    if (!res.ok) {
      setCheckError(res.error);
      return;
    }
    if (res.conflicts.length === 0) {
      proceed();
      return;
    }
    setPending({ conflicts: res.conflicts, proceed });
  }

  const panel = (
    <>
      {checkError && <p className="text-sm text-destructive">{checkError}</p>}
      {pending && (
        <ConflictWarning
          conflicts={pending.conflicts}
          onConfirm={() => {
            const proceed = pending.proceed;
            setPending(null);
            proceed();
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );

  return { guard, checking, panel };
}

const CONFLICT_KIND_LABELS: Record<SlotConflict["kind"], string> = {
  room: "החדר תפוס",
  self: "המטפל/ת כבר משובצ/ת בחדר אחר",
  block: "חסימה",
};

const MAX_CONFLICTS_SHOWN = 15;

function ConflictWarning({
  conflicts,
  onConfirm,
  onCancel,
}: {
  conflicts: SlotConflict[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <p className="font-medium">⚠️ נמצאו {conflicts.length} התנגשויות עם הזמנות קיימות</p>
      <p className="text-xs">
        ההזמנות הקיימות לא יידרסו — המפגשים של הססיה בתאריכים האלה פשוט לא ייקבעו.
      </p>
      <ul className="flex flex-col gap-0.5">
        {conflicts.slice(0, MAX_CONFLICTS_SHOWN).map((c, i) => (
          <li key={i}>
            <span className="font-medium">{c.date}</span> · <span dir="ltr">{c.time}</span> · {c.roomName} · {c.who}{" "}
            <span className="text-xs opacity-75">({CONFLICT_KIND_LABELS[c.kind]})</span>
          </li>
        ))}
        {conflicts.length > MAX_CONFLICTS_SHOWN && (
          <li className="text-xs">ועוד {conflicts.length - MAX_CONFLICTS_SHOWN}…</li>
        )}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>
          חזרה לעריכה
        </Button>
        <Button size="sm" variant="destructive" onClick={onConfirm}>
          לשמור בכל זאת
        </Button>
      </div>
    </div>
  );
}

function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-amber-700 dark:text-amber-400">{notice}</p>}
    </>
  );
}

function SubscriptionBlock({
  sub,
  roomOptions,
  roomName,
  today,
}: {
  sub: ManagedSubscription;
  roomOptions: RoomOption[];
  roomName: Map<string, string>;
  today: string;
}) {
  const [panel, setPanel] = useState<null | "add" | "cancel" | "upcoming" | "price">(null);
  const toggle = (p: typeof panel) => setPanel((cur) => (cur === p ? null : p));

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">{sub.weekly_hours} ש׳ שבועיות</span>
        <span className="text-muted-foreground">{formatCurrency(sub.monthly_price)}/חודש</span>
        {sub.start_date && sub.start_date > today && (
          <span className="text-muted-foreground">מתחילה {dateLabel(sub.start_date)}</span>
        )}
        {sub.effective_end_date && (
          <span className="rounded bg-amber-100 px-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            עד {dateLabel(sub.effective_end_date)}
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {sub.slots.map((slot) => (
          <SlotRow key={slot.id} slot={slot} sub={sub} roomOptions={roomOptions} roomName={roomName} today={today} />
        ))}
        {sub.slots.length === 0 && <li className="text-sm text-muted-foreground">אין משבצות פעילות.</li>}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => toggle("add")}>
          + משבצת
        </Button>
        <Button size="sm" variant="outline" onClick={() => toggle("upcoming")}>
          מפגשים קרובים ({sub.upcoming.length})
        </Button>
        <Button size="sm" variant="outline" onClick={() => toggle("price")}>
          מחיר
        </Button>
        <Button size="sm" variant="outline" className="text-destructive" onClick={() => toggle("cancel")}>
          ביטול ססיה
        </Button>
      </div>

      {panel === "add" && <AddSlotForm sub={sub} roomOptions={roomOptions} today={today} onDone={() => setPanel(null)} />}
      {panel === "price" && <PriceForm sub={sub} onDone={() => setPanel(null)} />}
      {panel === "cancel" && <CancelForm sub={sub} today={today} onDone={() => setPanel(null)} />}
      {panel === "upcoming" && <UpcomingList sub={sub} roomOptions={roomOptions} roomName={roomName} />}
    </div>
  );
}

function SlotRow({
  slot,
  sub,
  roomOptions,
  roomName,
  today,
}: {
  slot: Slot;
  sub: ManagedSubscription;
  roomOptions: RoomOption[];
  roomName: Map<string, string>;
  today: string;
}) {
  const [mode, setMode] = useState<null | "edit" | "remove">(null);
  const [from, setFrom] = useState(slot.valid_from && slot.valid_from > today ? slot.valid_from : today);
  const { busy, error, notice, run } = useAction();
  const { guard, checking, panel } = useConflictGuard();

  return (
    <li className="flex flex-col gap-2 rounded-md bg-muted/40 p-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-medium">יום {WEEKDAY_LABELS[slot.weekday]}</span> · {hhmm(slot.start_time)}–
          {hhmm(slot.end_time)} · {roomName.get(slot.room_id) ?? "חדר"}
          {slot.valid_from && slot.valid_from > today && (
            <span className="text-muted-foreground"> · מ-{dateLabel(slot.valid_from)}</span>
          )}
          {slot.valid_until && <span className="text-muted-foreground"> · עד {dateLabel(slot.valid_until)}</span>}
        </span>
        <span className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setMode(mode === "edit" ? null : "edit")}>
            שינוי
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(mode === "remove" ? null : "remove")}>
            הסרה
          </Button>
        </span>
      </div>

      {mode === "edit" && (
        <SlotForm
          initial={{ roomId: slot.room_id, weekday: slot.weekday, startTime: hhmm(slot.start_time), endTime: hhmm(slot.end_time) }}
          roomOptions={roomOptions}
          from={from}
          setFrom={setFrom}
          today={today}
          submitLabel="שמירת השינוי"
          busy={busy || checking}
          onSubmit={(draft) =>
            guard(
              // מפגשי הססיה הזו עצמה לא נחשבים התנגשות — הישנים מבוטלים מהתאריך.
              { slots: [draft], from, until: sub.effective_end_date, userId: sub.user_id, excludeSubscriptionId: sub.id },
              () => run(() => changeSlotAction({ slotId: slot.id, ...draft, from }), () => setMode(null)),
            )
          }
        />
      )}
      {panel}
      {mode === "remove" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">להסיר החל מ-</Label>
            <DateInput min={today} value={from} onChange={(e) => setFrom(e.target.value)} className="w-52" />
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => run(() => removeSlotAction({ slotId: slot.id, from }), () => setMode(null))}
          >
            {busy ? "מסיר..." : "הסרת המשבצת"}
          </Button>
        </div>
      )}
      <Feedback error={error} notice={notice} />
    </li>
  );
}

function SlotForm({
  initial,
  roomOptions,
  from,
  setFrom,
  today,
  submitLabel,
  busy,
  onSubmit,
}: {
  initial: SlotDraft;
  roomOptions: RoomOption[];
  from: string;
  setFrom: (v: string) => void;
  today: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (draft: SlotDraft) => void;
}) {
  const [draft, setDraft] = useState<SlotDraft>(initial);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <SlotFields draft={draft} setDraft={setDraft} roomOptions={roomOptions} />
      <div className="flex flex-col gap-1">
        <Label className="text-xs">החל מתאריך</Label>
        <DateInput min={today} value={from} onChange={(e) => setFrom(e.target.value)} className="w-52" />
      </div>
      <Button size="sm" disabled={busy} onClick={() => onSubmit(draft)}>
        {busy ? "שומר..." : submitLabel}
      </Button>
    </div>
  );
}

function SlotFields({
  draft,
  setDraft,
  roomOptions,
}: {
  draft: SlotDraft;
  setDraft: (d: SlotDraft) => void;
  roomOptions: RoomOption[];
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">חדר</Label>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={draft.roomId}
          onChange={(e) => setDraft({ ...draft, roomId: e.target.value })}
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
          value={draft.weekday}
          onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}
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
        <TimeSelect
          value={draft.startTime}
          onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
          className="w-28"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">עד שעה</Label>
        <TimeSelect
          value={draft.endTime}
          onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
          className="w-28"
        />
      </div>
    </>
  );
}

function AddSlotForm({
  sub,
  roomOptions,
  today,
  onDone,
}: {
  sub: ManagedSubscription;
  roomOptions: RoomOption[];
  today: string;
  onDone: () => void;
}) {
  const [from, setFrom] = useState(today);
  const { busy, error, notice, run } = useAction();
  const { guard, checking, panel } = useConflictGuard();
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-2">
      <SlotForm
        initial={{ roomId: roomOptions[0]?.id ?? "", weekday: 0, startTime: "09:00", endTime: "14:00" }}
        roomOptions={roomOptions}
        from={from}
        setFrom={setFrom}
        today={today}
        submitLabel="הוספה"
        busy={busy || checking}
        onSubmit={(draft) =>
          guard({ slots: [draft], from, until: sub.effective_end_date, userId: sub.user_id }, () =>
            run(() => addSlotAction({ subscriptionId: sub.id, ...draft, from }), onDone),
          )
        }
      />
      {panel}
      <Feedback error={error} notice={notice} />
    </div>
  );
}

function PriceForm({ sub, onDone }: { sub: ManagedSubscription; onDone: () => void }) {
  const [price, setPrice] = useState(String(sub.monthly_price));
  const { busy, error, notice, run } = useAction();
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">מחיר חודשי לפני מע״מ</Label>
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="w-32" />
        </div>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            const value = Number(price);
            if (!Number.isFinite(value) || value < 0) return;
            void run(async () => {
              const res = await setSessionPriceAction(sub.id, value);
              return res.ok ? { ok: true } : { ok: false, error: res.error };
            }, onDone);
          }}
        >
          {busy ? "שומר..." : "שמירה"}
        </Button>
      </div>
      <Feedback error={error} notice={notice} />
    </div>
  );
}

function CancelForm({ sub, today, onDone }: { sub: ManagedSubscription; today: string; onDone: () => void }) {
  const [from, setFrom] = useState(today);
  const [toCard, setToCard] = useState(false);
  const [hours, setHours] = useState("");
  const { busy, error, notice, run } = useAction();
  const affected = sub.upcoming.filter((b) => b.starts_at >= dayBoundaries(from).start.toISOString()).length;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-2 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">לבטל החל מ-</Label>
          <DateInput min={today} value={from} onChange={(e) => setFrom(e.target.value)} className="w-52" />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4" checked={toCard} onChange={(e) => setToCard(e.target.checked)} />
          להעביר לכרטיסייה
        </label>
        {toCard && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs">שעות לכרטיסייה</Label>
            <Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} className="w-24" />
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        יבוטלו {affected} מפגשים מהשבועות הקרובים (וכל מה שאחריהם). מה שלפני התאריך נשאר.
      </p>
      <Button
        size="sm"
        variant="destructive"
        className="w-fit"
        disabled={busy}
        onClick={() =>
          run(
            () =>
              cancelSessionAction({
                subscriptionId: sub.id,
                userId: sub.user_id,
                from,
                cardHours: toCard && hours ? Number(hours) : null,
              }),
            onDone,
          )
        }
      >
        {busy ? "מבטל..." : "ביטול הססיה"}
      </Button>
      <Feedback error={error} notice={notice} />
    </div>
  );
}

function UpcomingList({
  sub,
  roomOptions,
  roomName,
}: {
  sub: ManagedSubscription;
  roomOptions: RoomOption[];
  roomName: Map<string, string>;
}) {
  if (sub.upcoming.length === 0) return <p className="text-sm text-muted-foreground">אין מפגשים קרובים.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {sub.upcoming.map((b) => (
        <OccurrenceRow key={b.id} booking={b} userId={sub.user_id} roomOptions={roomOptions} roomName={roomName} />
      ))}
    </ul>
  );
}

function OccurrenceRow({
  booking,
  userId,
  roomOptions,
  roomName,
}: {
  booking: ManagedSubscription["upcoming"][number];
  userId: string;
  roomOptions: RoomOption[];
  roomName: Map<string, string>;
}) {
  const start = new Date(booking.starts_at);
  const end = new Date(booking.ends_at);
  const isoDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(start);
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState(isoDate);
  const [draft, setDraft] = useState<SlotDraft>({
    roomId: booking.room_id,
    weekday: 0,
    startTime: formatTimeHe(start),
    endTime: formatTimeHe(end),
  });
  const { busy, error, notice, run } = useAction();
  const { guard, checking, panel } = useConflictGuard();

  return (
    <li className="flex flex-col gap-1 rounded-md border p-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {formatDateHe(start)} · {formatTimeHe(start)}–{formatTimeHe(end)} · {roomName.get(booking.room_id) ?? "חדר"}
          {booking.admin_note && <span className="text-xs text-muted-foreground"> · הוזז</span>}
        </span>
        <span className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setMoving((v) => !v)}>
            הזזה
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`לבטל את המפגש של ${formatDateHe(start)}? (רק המפגש הזה)`)) {
                void run(() => cancelOccurrenceAction(booking.id));
              }
            }}
          >
            ביטול
          </Button>
        </span>
      </div>
      {moving && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">תאריך</Label>
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} className="w-52" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">חדר</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={draft.roomId}
              onChange={(e) => setDraft({ ...draft, roomId: e.target.value })}
            >
              {roomOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">משעה</Label>
            <TimeSelect
              value={draft.startTime}
              onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
              className="w-28"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">עד שעה</Label>
            <TimeSelect
              value={draft.endTime}
              onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
              className="w-28"
            />
          </div>
          <Button
            size="sm"
            disabled={busy || checking}
            onClick={() => {
              const target = {
                roomId: draft.roomId,
                startsAt: israelIso(date, draft.startTime),
                endsAt: israelIso(date, draft.endTime),
              };
              void guard({ single: target, userId, excludeBookingId: booking.id }, () =>
                run(() => moveOccurrenceAction({ bookingId: booking.id, ...target }), () => setMoving(false)),
              );
            }}
          >
            {busy ? "מזיז..." : checking ? "בודק..." : "הזזת המפגש"}
          </Button>
        </div>
      )}
      {panel}
      <Feedback error={error} notice={notice} />
    </li>
  );
}

function NewSessionForm({
  allTherapists,
  roomOptions,
  today,
  onDone,
}: {
  allTherapists: { id: string; name: string; phone: string }[];
  roomOptions: RoomOption[];
  today: string;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("");
  const [slots, setSlots] = useState<SlotDraft[]>([
    { roomId: roomOptions[0]?.id ?? "", weekday: 0, startTime: "09:00", endTime: "14:00" },
  ]);
  const [startDate, setStartDate] = useState(today);
  const [price, setPrice] = useState("");
  const { busy, error, notice, run } = useAction();
  const { guard, checking, panel } = useConflictGuard();

  const matches = allTherapists.filter((t) => t.name.includes(query) || t.phone.includes(query)).slice(0, 8);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="font-medium">ססיה חדשה</p>
        <p className="text-xs text-muted-foreground">
          נקבעת מיד כפעילה — בלי קישור תשלום ובלי מייל. המפגשים נכנסים ללוח מתאריך ההתחלה.
        </p>
        <div className="flex flex-col gap-1">
          <Input
            placeholder="חיפוש מטפל/ת (שם או טלפון)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setUserId("");
            }}
            className="max-w-sm"
          />
          {query && !userId && (
            <ul className="max-h-40 max-w-sm overflow-y-auto rounded-md border text-sm">
              {matches.map((t) => (
                <li
                  key={t.id}
                  className="cursor-pointer p-1.5 hover:bg-muted"
                  onClick={() => {
                    setUserId(t.id);
                    setQuery(t.name);
                  }}
                >
                  {t.name} · {t.phone}
                </li>
              ))}
            </ul>
          )}
        </div>

        {slots.map((slot, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <SlotFields
              draft={slot}
              setDraft={(d) => setSlots((prev) => prev.map((s, j) => (j === i ? d : s)))}
              roomOptions={roomOptions}
            />
            {slots.length > 1 && (
              <Button size="sm" variant="ghost" onClick={() => setSlots((prev) => prev.filter((_, j) => j !== i))}>
                הסרה
              </Button>
            )}
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          onClick={() => setSlots((prev) => [...prev, { ...prev[prev.length - 1] }])}
        >
          + עוד משבצת
        </Button>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">תאריך התחלה</Label>
            <DateInput min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-52" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">מחיר חודשי (ריק = יחסי לשעות)</Label>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="w-32" />
          </div>
        </div>

        <Button
          className="w-fit"
          disabled={busy || checking || !userId}
          onClick={() =>
            guard({ slots, from: startDate, until: null, userId }, () =>
              run(async () => {
                const res = await claimSkeddaSessionAction({
                  userId,
                  slots,
                  startDate,
                  termMonths: null,
                  monthlyPrice: price.trim() === "" ? null : Number(price),
                });
                return res.ok ? { ok: true } : { ok: false, error: res.error };
              }, onDone),
            )
          }
        >
          {busy ? "יוצר..." : checking ? "בודק התנגשויות..." : "יצירת הססיה"}
        </Button>
        {panel}
        <Feedback error={error} notice={notice} />
      </CardContent>
    </Card>
  );
}
