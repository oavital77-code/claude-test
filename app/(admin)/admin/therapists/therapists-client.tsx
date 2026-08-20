"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { formatDateHe } from "@/lib/time";
import type { Database } from "@/lib/supabase/types";

type TherapistRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "phone" | "email" | "status" | "created_at"
>;

const STATUS_LABELS: Record<TherapistRow["status"], string> = {
  active: "פעיל",
  suspended: "מושעה",
  archived: "בארכיון",
};

export function TherapistsClient({ therapists }: { therapists: TherapistRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return therapists;
    return therapists.filter(
      (t) => t.full_name.includes(q) || t.phone.includes(q) || t.email.includes(q),
    );
  }, [therapists, query]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="חיפוש לפי שם, טלפון או מייל"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-right">
            <tr>
              <th className="p-2">שם</th>
              <th className="p-2">טלפון</th>
              <th className="p-2">מייל</th>
              <th className="p-2">סטטוס</th>
              <th className="p-2">הצטרפות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="p-2">
                  <Link href={`/admin/therapists/${t.id}`} className="text-primary underline-offset-4 hover:underline">
                    {t.full_name}
                  </Link>
                </td>
                <td className="p-2" dir="ltr">
                  {t.phone}
                </td>
                <td className="p-2" dir="ltr">
                  {t.email}
                </td>
                <td className="p-2">{STATUS_LABELS[t.status]}</td>
                <td className="p-2">{formatDateHe(new Date(t.created_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
