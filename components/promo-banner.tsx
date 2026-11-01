"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// באנרים של שותפים (PayPlus — bit). כיבוי: enabled=false.
// ה-X מסתיר לשאר הביקור בלבד — ה-state יושב ב-AppShell (שנשאר mounted בין
// מעברי עמודים), כך שבכל פתיחה/רענון של המערכת הבאנר מופיע שוב. בכוונה בלי
// localStorage/cookie.
const HREF = "https://aff.pays.plus/cf3975e1-6a1a-4043-8745-665c8c35be81?ref=";
const ALT = "PayPlus — קבלו את ה-bit";

export const PROMO_BANNERS = {
  // תחתית כל עמוד (מובייל + מחשב), בתוך זרימת הדף — לא צף, כדי לא להסתיר
  // את הכרטיס הצף של בחירת שעות בלוח.
  bottom: { enabled: true, href: HREF, src: "/promo/payplus-bit-wide.gif", width: 970, height: 250 },
  // החלק הריק בסרגל הצד (מחשב בלבד).
  sidebar: { enabled: true, href: HREF, src: "/promo/payplus-bit-square.gif", width: 300, height: 250 },
} as const;

export type PromoSlot = keyof typeof PROMO_BANNERS;

export function PromoBanner({
  slot,
  onDismiss,
  className,
}: {
  slot: PromoSlot;
  onDismiss: () => void;
  className?: string;
}) {
  const b = PROMO_BANNERS[slot];
  if (!b.enabled) return null;
  return (
    <div className={cn("relative w-full overflow-hidden rounded-card", className)} style={{ maxWidth: b.width }}>
      <a href={b.href} target="_blank" rel="sponsored noopener noreferrer" className="block">
        {/* GIF מונפש — next/image לא מעבד GIF בכל מקרה */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={b.src} alt={ALT} width={b.width} height={b.height} className="block h-auto w-full" />
      </a>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="סגירת הבאנר"
        className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 before:absolute before:-inset-2 before:content-['']"
      >
        <X className="size-3.5" strokeWidth={2.5} />
      </button>
      {/* סימון כפרסומת — ליד ה-X, לא לחיץ (הלחיצה עוברת לקישור שמתחתיו) */}
      <span className="pointer-events-none absolute left-9 top-1.5 flex h-6 items-center rounded-full bg-black/55 px-2 text-[11px] font-medium leading-none text-white">
        פרסומת
      </span>
    </div>
  );
}
