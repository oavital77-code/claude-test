"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { formatDateHe, formatDateTimeHe } from "@/lib/time";
import type { Database } from "@/lib/supabase/types";
import {
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

export function TherapistDetailClient({
  profile,
  adminNote,
  punchCards,
  bookings,
  payments,
  subscriptions,
}: {
  profile: Profile;
  adminNote: string;
  punchCards: PunchCard[];
  bookings: BookingRow[];
  payments: Payment[];
  subscriptions: Subscription[];
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <ProfileSection profile={profile} adminNote={adminNote} onSaved={() => router.refresh()} />
      <BonusHoursSection userId={profile.id} onGranted={() => router.refresh()} />

      <Section title="כרטיסיות">
        {punchCards.length === 0 ? (
          <Empty />
        ) : (
          punchCards.map((c) => <PunchCardRow key={c.id} card={c} onCompleted={() => router.refresh()} />)
        )}
      </Section>

      <Section title="ססיות">
        {subscriptions.length === 0 ? (
          <Empty />
        ) : (
          subscriptions.map((s) => (
            <p key={s.id} className="text-sm">
              {s.weekly_hours} ש׳/שבוע · {formatCurrency(s.monthly_price)}/חודש · סטטוס: {s.status}
            </p>
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

function PunchCardRow({ card, onCompleted }: { card: PunchCard; onCompleted: () => void }) {
  const [loading, setLoading] = useState(false);
  const depositShort = card.deposit_remaining < card.deposit_amount;

  async function handleComplete() {
    setLoading(true);
    await completeDepositAction(card.id);
    setLoading(false);
    onCompleted();
  }

  return (
    <div className="flex items-center justify-between rounded-md border p-3 text-sm">
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
  );
}
