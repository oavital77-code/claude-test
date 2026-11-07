"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";
import { syncMyPurchases } from "@/app/(app)/purchase-sync-actions";

// כמה זמן אחורה מחשבים "חדש" ביחס לפתיחת המערכת — מכסה כרטיסייה שנזקפה
// (webhook) בין הרינדור בשרת לטעינה בדפדפן.
const LOOKBACK_MS = 60_000;
// אחרי כל חזרה ללשונית: בדיקה מיד, ושוב אחרי 20 שניות (החנות לפעמים מעדכנת
// את סטטוס ההזמנה כמה שניות אחרי ההפניה מעמוד התשלום).
// ⚠️ כל בדיקה = הפעלת פונקציה ב-Vercel. ב-07/11 חשבון ה-Vercel הושבת על חריגה
// ממכסה — לא להגדיל תדירויות כאן בלי לחשב עלות (ר' CLAUDE.md, "עלויות").
const FOLLOW_UPS_MS = [0, 20_000];
// בעמוד הרכישה המטפל/ת מחכה לכרטיסייה — כל 30 שניות, ולכל היותר 5 דקות.
const PURCHASE_PAGE_INTERVAL_MS = 30_000;
const PURCHASE_PAGE_MAX_MS = 5 * 60_000;

/**
 * רכישה מופיעה מיד: כשהמערכת נפתחת וכשחוזרים ללשונית, בודק רכישות חדשות;
 * אם נוספו שעות — מרענן את הנתונים במסך (בלי טעינה מחדש) ומציג הודעה.
 */
export function PurchaseSync() {
  const router = useRouter();
  const pathname = usePathname();
  const [sinceIso] = useState(() => new Date(Date.now() - LOOKBACK_MS).toISOString());
  const shownRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef(false);
  const [notice, setNotice] = useState<number | null>(null);

  const check = useCallback(async () => {
    if (inFlightRef.current || document.visibilityState !== "visible") return;
    inFlightRef.current = true;
    try {
      const { addedHours, cardIds } = await syncMyPurchases({ sinceIso });
      const fresh = cardIds.filter((id) => !shownRef.current.has(id));
      if (fresh.length > 0 && addedHours > 0) {
        fresh.forEach((id) => shownRef.current.add(id));
        setNotice(addedHours);
        router.refresh();
      }
    } catch {
      // best-effort — הבדיקה הבאה תנסה שוב
    } finally {
      inFlightRef.current = false;
    }
  }, [router, sinceIso]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const burst = () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
      for (const ms of FOLLOW_UPS_MS) timers.push(setTimeout(check, ms));
    };
    burst();
    const onVisible = () => document.visibilityState === "visible" && burst();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [check]);

  useEffect(() => {
    if (!pathname.startsWith("/purchase")) return;
    const id = setInterval(check, PURCHASE_PAGE_INTERVAL_MS);
    const stop = setTimeout(() => clearInterval(id), PURCHASE_PAGE_MAX_MS);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [pathname, check]);

  useEffect(() => {
    if (notice === null) return;
    const id = setTimeout(() => setNotice(null), 10_000);
    return () => clearTimeout(id);
  }, [notice]);

  if (notice === null) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-card border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 shadow-lg"
    >
      <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
      <span className="flex-1 text-[15px] font-medium">
        הרכישה התקבלה — נוספו {notice.toLocaleString("he-IL")} שעות לחשבון שלך
      </span>
      <button type="button" onClick={() => setNotice(null)} aria-label="סגירה" className="rounded-full p-1 hover:bg-emerald-100">
        <X className="size-4" />
      </button>
    </div>
  );
}
