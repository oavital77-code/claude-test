"use client";

import { X } from "lucide-react";

// באנר שותפים (PayPlus — Google Pay). כיבוי: enabled=false.
// ה-X מסתיר לשאר הביקור בלבד — ה-state יושב ב-AppShell (שנשאר mounted בין
// מעברי עמודים), כך שבכל פתיחה/רענון של המערכת הבאנר מופיע שוב. בכוונה בלי
// localStorage/cookie.
export const PROMO_BANNER = {
  enabled: true,
  href: "https://aff.pays.plus/cf3975e1-6a1a-4043-8745-665c8c35be81?ref=",
  src: "/promo/payplus-gpay.gif",
  alt: "PayPlus — מהיום האתר שלכם יכול לקבל תשלומים ב-Google Pay",
  width: 728,
  height: 90,
} as const;

export function PromoBanner({ onDismiss }: { onDismiss: () => void }) {
  if (!PROMO_BANNER.enabled) return null;
  return (
    <div className="relative mx-auto mb-4 w-full max-w-[728px] overflow-hidden rounded-card md:mb-6">
      <a href={PROMO_BANNER.href} target="_blank" rel="sponsored noopener noreferrer" className="block">
        {/* GIF מונפש — next/image לא מעבד GIF בכל מקרה */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PROMO_BANNER.src}
          alt={PROMO_BANNER.alt}
          width={PROMO_BANNER.width}
          height={PROMO_BANNER.height}
          className="block h-auto w-full"
        />
      </a>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="סגירת הבאנר"
        className="absolute left-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 before:absolute before:-inset-2 before:content-['']"
      >
        <X className="size-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}
