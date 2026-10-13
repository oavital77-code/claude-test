"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Database } from "@/lib/supabase/types";
import { addSkeddaRowAction, provisionSkeddaAccountsAction, updateSkeddaRowAction } from "./actions";
import type { ProvisionRowResult } from "./actions";

type Row = Database["public"]["Tables"]["skedda_migration"]["Row"];

type Filter = "all" | "review" | "session" | "negative" | "ready" | "done";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "review", label: "להשלמה" },
  { key: "session", label: "ססיות" },
  { key: "negative", label: "יתרה שלילית" },
  { key: "ready", label: "מוכנים להעברה" },
  { key: "done", label: "הועברו / דולגו" },
  { key: "all", label: "הכול" },
];

const CONFIDENCE_LABELS: Record<Row["confidence"], string> = {
  high: "ביטחון גבוה",
  medium: "ביטחון בינוני",
  review: "לבדיקה",
};

function needsReview(r: Row) {
  return r.status === "pending" && (r.confidence === "review" || r.balance_hours === null || !r.email);
}

function matches(r: Row, f: Filter) {
  switch (f) {
    case "all":
      return true;
    case "review":
      return needsReview(r);
    case "session":
      // גם אחרי שהחשבון נפתח והיתרה עברה — הססיה עצמה עוד ממתינה לקליטה.
      return r.has_session && r.status !== "skipped";
    case "negative":
      return r.status === "pending" && (r.balance_hours ?? 0) < 0;
    case "ready":
      return r.status === "pending" && !needsReview(r) && !r.has_session && (r.balance_hours ?? 0) >= 0;
    case "done":
      return r.status !== "pending";
  }
}

export function SkeddaMigrationClient({
  rows,
  registeredEmails,
  claimEnabled,
}: {
  rows: Row[];
  registeredEmails: string[];
  claimEnabled: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("review");
  const [query, setQuery] = useState("");
  const registered = useMemo(() => new Set(registeredEmails), [registeredEmails]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter((r) => matches(r, f.key)).length])),
    [rows],
  );
  const hoursToTransfer = rows
    .filter((r) => matches(r, "ready"))
    .reduce((sum, r) => sum + (r.balance_hours ?? 0), 0);

  const visible = rows.filter((r) => {
    if (!matches(r, filter)) return false;
    const q = query.trim().toLowerCase();
    return !q || r.full_name.toLowerCase().includes(q) || (r.email ?? "").includes(q);
  });

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="flex flex-col gap-1 pt-4 text-sm">
          <p>
            {rows.length} מטפלים · {counts.ready} מוכנים להעברה ({hoursToTransfer} שעות) · {counts.review} להשלמה ·{" "}
            {counts.session} ססיות
          </p>
          <p className={claimEnabled ? "text-success" : "text-muted-foreground"}>
            {claimEnabled
              ? "ההעברה האוטומטית פעילה: מטפל/ת שנרשם/ת מקבל/ת את היתרה לפי המייל."
              : "ההעברה האוטומטית כבויה עד ההשקה (הגדרות → skedda_balance_claim_enabled). עריכה כאן לא משנה כלום אצל המטפלים."}
          </p>
          <p className="text-muted-foreground">
            היתרה מחושבת מהיסטוריית ההזמנות ב-Skedda (כולל הזמנות קדימה), בהנחה שכרטיסייה חדשה נקנית כשהקודמת
            נגמרת. ססיות ויתרות שליליות לא מועברות אוטומטית — נקלטות ידנית בכרטיס המטפל/ת.
          </p>
        </CardContent>
      </Card>

      <ProvisionAccounts rows={rows} registered={registered} />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
          >
            {f.label} ({counts[f.key]})
          </Button>
        ))}
        <Input
          placeholder="חיפוש לפי שם או מייל"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין שורות בסינון הזה.</p>
      ) : (
        visible.map((r) => (
          <SkeddaRowCard key={r.id} row={r} isRegistered={!!r.email && registered.has(r.email.toLowerCase())} />
        ))
      )}

      <AddRow />
    </div>
  );
}

function SkeddaRowCard({ row, isRegistered }: { row: Row; isRegistered: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: row.full_name,
    email: row.email ?? "",
    balance_hours: row.balance_hours === null ? "" : String(row.balance_hours),
    has_session: row.has_session,
    session_details: row.session_details ?? "",
    session_paid_until: row.session_paid_until ?? "",
    session_commitment: row.session_commitment ?? "",
    admin_note: row.admin_note ?? "",
    skipped: row.status === "skipped",
  });
  const locked = row.status === "transferred";

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const balance = form.balance_hours.trim() === "" ? null : Number(form.balance_hours);
    if (balance !== null && Number.isNaN(balance)) {
      setSaving(false);
      setError("יתרה חייבת להיות מספר");
      return;
    }
    const result = await updateSkeddaRowAction({
      id: row.id,
      full_name: form.full_name,
      email: form.email,
      balance_hours: balance,
      has_session: form.has_session,
      session_details: form.session_details,
      session_paid_until: form.session_paid_until,
      session_commitment: form.session_commitment,
      admin_note: form.admin_note,
      status: form.skipped ? "skipped" : "pending",
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const balanceText =
    row.balance_hours === null ? "לא ידוע" : `${row.balance_hours} ש׳${row.balance_hours < 0 ? " (להפחית)" : ""}`;

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">
              {row.full_name}
              {row.has_session && <span className="ms-2 text-violet-600">· ססיה</span>}
              {isRegistered && <span className="ms-2 text-success">· רשום/ה ב-Cleana</span>}
            </span>
            <span className="text-muted-foreground" dir="ltr">
              {row.email ?? "— אין מייל —"}
            </span>
            <span>
              {row.skedda_product ?? "אין מוצר"} · נוצלו {row.used_hours ?? 0} ש׳ · <b>יתרה: {balanceText}</b> ·{" "}
              {CONFIDENCE_LABELS[row.confidence]}
              {row.status === "transferred" && " · ✓ הועבר"}
              {row.status === "skipped" && " · דולג"}
            </span>
            {row.note && <span className="text-muted-foreground">{row.note}</span>}
            {row.session_details && <span>ססיה: {row.session_details}</span>}
            {row.admin_note && <span>הערה: {row.admin_note}</span>}
          </div>
          {!locked && (
            <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
              {open ? "סגירה" : "עריכה"}
            </Button>
          )}
        </div>

        {open && !locked && (
          <div className="grid grid-cols-1 gap-2 border-t pt-2 md:grid-cols-2">
            <Field label="שם">
              <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
            </Field>
            <Field label="מייל (לפיו היתרה עוברת בהרשמה)">
              <Input dir="ltr" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="יתרת שעות להעברה (ריק = לא ידוע)">
              <Input
                inputMode="decimal"
                value={form.balance_hours}
                onChange={(e) => set("balance_hours", e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                checked={form.has_session}
                onChange={(e) => set("has_session", e.target.checked)}
              />
              יש ססיה קבועה
            </label>
            {form.has_session && (
              <>
                <Field label="פרטי הססיה (יום, שעות, סניף, חדר)">
                  <Input value={form.session_details} onChange={(e) => set("session_details", e.target.value)} />
                </Field>
                <Field label="שולם עד">
                  <Input
                    type="date"
                    value={form.session_paid_until}
                    onChange={(e) => set("session_paid_until", e.target.value)}
                  />
                </Field>
                <Field label="התחייבות (חודש / 3 / 6 / 12)">
                  <Input
                    value={form.session_commitment}
                    onChange={(e) => set("session_commitment", e.target.value)}
                  />
                </Field>
              </>
            )}
            <Field label="הערה שלי">
              <Input value={form.admin_note} onChange={(e) => set("admin_note", e.target.value)} />
            </Field>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.skipped} onChange={(e) => set("skipped", e.target.checked)} />
              לדלג (לא להעביר כלום)
            </label>
            <div className="flex items-center gap-2 md:col-span-2">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "שומר..." : "שמירה"}
              </Button>
              {error && <span className="text-destructive">{error}</span>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function AddRow() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function add() {
    setSaving(true);
    setError(null);
    const result = await addSkeddaRowAction({ full_name: name });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName("");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-t pt-3">
      <Field label="הוספת מטפל/ת שלא ברשימה">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מלא" />
      </Field>
      <Button size="sm" variant="outline" onClick={add} disabled={saving || !name.trim()}>
        הוספה
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}

/**
 * פתיחת חשבונות מראש לכל מי שבטבלה: שורות pending עם מייל, וטלפון (או
 * חשבון קיים). רץ בקבוצות של 5 — כל קבוצה היא קריאה נפרדת לשרת.
 */
function ProvisionAccounts({ rows, registered }: { rows: Row[]; registered: Set<string> }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<ProvisionRowResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const eligible = rows.filter(
    (r) => r.status === "pending" && !!r.email && (!!r.phone || registered.has(r.email.toLowerCase())),
  );
  const missingPhone = rows.filter(
    (r) => r.status === "pending" && !!r.email && !r.phone && !registered.has(r.email.toLowerCase()),
  );

  async function run() {
    const ok = window.confirm(
      `לפתוח חשבון Cleana ל-${eligible.length} מטפלים, להעביר להם את יתרת ה-Skedda ולשייך רכישות מהחנות?\n` +
        "המטפלים ייכנסו דרך 'שכחתי סיסמה' עם המייל שלהם. הפעולה לא נשלחת אליהם במייל.",
    );
    if (!ok) return;
    setRunning(true);
    setError(null);
    setResults([]);
    setDone(0);
    const ids = eligible.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 5) {
      const res = await provisionSkeddaAccountsAction({ rowIds: ids.slice(i, i + 5) });
      if (!res.ok) {
        setError(res.error);
        break;
      }
      setResults((prev) => [...prev, ...res.results]);
      setDone(Math.min(i + 5, ids.length));
    }
    setRunning(false);
    router.refresh();
  }

  const failed = results.filter((r) => !r.ok);

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <b>פתיחת חשבונות:</b> {eligible.length} מטפלים מוכנים
            {missingPhone.length > 0 && ` · ${missingPhone.length} ממתינים לטלפון`}
          </span>
          <Button size="sm" onClick={run} disabled={running || eligible.length === 0}>
            {running ? `פותח... ${done}/${eligible.length}` : "פתיחת חשבונות"}
          </Button>
        </div>
        {error && <p className="text-destructive">{error}</p>}
        {results.length > 0 && !running && (
          <p>
            הסתיים: {results.length - failed.length} הצליחו{failed.length > 0 && `, ${failed.length} נכשלו`}.
          </p>
        )}
        {failed.map((r) => (
          <p key={r.id} className="text-destructive">
            {r.name}: {r.message}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}
