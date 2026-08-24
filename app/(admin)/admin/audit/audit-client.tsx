"use client";

import { useMemo, useState } from "react";
import { formatDateTimeHe } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  describeAuditAction,
  ENTITY_LABELS,
  SEVERITY_LABELS,
  type AuditSeverity,
} from "@/lib/audit-labels";

export interface AuditRow {
  id: number;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
  actorName: string;
  details: unknown;
}

const SEVERITY_STYLES: Record<AuditSeverity, string> = {
  therapist: "bg-muted text-muted-foreground",
  admin: "bg-primary/15 text-primary",
  money: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  alert: "bg-destructive/15 text-destructive",
};

/** מציג את ה-jsonb של `after` כזוגות מפתח=ערך קריאים, בלי להציף את השורה. */
function formatDetails(details: unknown): string {
  if (!details || typeof details !== "object" || Array.isArray(details)) return "";
  const entries = Object.entries(details as Record<string, unknown>);
  if (entries.length === 0) return "";
  return entries
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}

export function AdminAuditClient({ rows }: { rows: AuditRow[] }) {
  const [severityFilter, setSeverityFilter] = useState<AuditSeverity | "all">("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // רשימת סוגי הפעולה נגזרת ממה שבאמת קיים ביומן, לא מהמילון — כך שקוד חדש
  // שנוסף ב-RPC יופיע בסינון גם לפני שמישהו הוסיף לו תרגום.
  const actionOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (!seen.has(r.action)) seen.set(r.action, describeAuditAction(r.action).label);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], "he"));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      const { severity } = describeAuditAction(r.action);
      if (severityFilter !== "all" && severity !== severityFilter) return false;
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (needle && !r.actorName.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, severityFilter, actionFilter, search]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as AuditSeverity | "all")}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="all">כל הסוגים</option>
          {(Object.keys(SEVERITY_LABELS) as AuditSeverity[]).map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABELS[s]}
            </option>
          ))}
        </select>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="all">כל הפעולות</option>
          {actionOptions.map(([action, label]) => (
            <option key={action} value={action}>
              {label}
            </option>
          ))}
        </select>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם"
          className="h-9 min-w-40 flex-1 rounded-md border bg-background px-3 text-sm"
        />

        <span className="text-sm text-muted-foreground">
          {filtered.length} מתוך {rows.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          אין פעולות התואמות לסינון.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap p-2 text-right font-medium">מתי</th>
                <th className="whitespace-nowrap p-2 text-right font-medium">מי</th>
                <th className="whitespace-nowrap p-2 text-right font-medium">פעולה</th>
                <th className="whitespace-nowrap p-2 text-right font-medium">על מה</th>
                <th className="p-2 text-right font-medium">פרטים</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const { label, severity } = describeAuditAction(r.action);
                const details = formatDetails(r.details);
                return (
                  <tr key={r.id} className="border-t align-top">
                    <td className="whitespace-nowrap p-2 tabular-nums text-muted-foreground">
                      {formatDateTimeHe(new Date(r.createdAt))}
                    </td>
                    <td className="whitespace-nowrap p-2">{r.actorName}</td>
                    <td className="whitespace-nowrap p-2">
                      <span className={cn("rounded-md px-2 py-0.5 text-xs", SEVERITY_STYLES[severity])}>
                        {label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap p-2 text-muted-foreground">
                      {ENTITY_LABELS[r.entity] ?? r.entity}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{details || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
