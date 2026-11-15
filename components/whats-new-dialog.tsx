"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { WHATS_NEW_KEY } from "@/lib/whats-new";

/**
 * "מה חדש" — קופץ פעם אחת (ר' lib/whats-new.ts ו-app/(app)/layout.tsx).
 * מסך 1: סרטון קצר של קביעת חדר בגרירה. מסך 2: חיבור ל-Cleana+.
 * כל סגירה (X, Escape, "הבנתי", מעבר לכרטיס שלי) נרשמת בחשבון כ"נראה".
 */
export function WhatsNewDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [step, setStep] = useState<0 | 1>(0);
  const [muted, setMuted] = useState(true);
  const markedRef = useRef(false);

  useEffect(() => {
    // תנועה מופחתת: בלי ניגון אוטומטי — עוצרים ומציגים פקדים (בלי state, ישר על האלמנט).
    const v = videoRef.current;
    if (v && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      v.autoplay = false;
      v.pause();
      v.controls = true;
    }
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  function markSeen() {
    if (markedRef.current) return;
    markedRef.current = true;
    // best-effort: אם נכשל, ההודעה פשוט תופיע שוב בפעם הבאה.
    void createClient()
      .auth.updateUser({ data: { whats_new_seen: WHATS_NEW_KEY } })
      .catch(() => {});
  }

  function close() {
    markSeen();
    videoRef.current?.pause();
    dialogRef.current?.close();
  }

  function toggleSound() {
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    if (!next) {
      // קול = מתחילים מההתחלה, כדי לשמוע את הכול
      v.currentTime = 0;
      void v.play().catch(() => {});
    }
    setMuted(next);
  }

  function next() {
    videoRef.current?.pause();
    setStep(1);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="whats-new-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="m-auto w-[min(440px,calc(100vw-24px))] max-h-[calc(100svh-24px)] overflow-y-auto rounded-modal border border-border bg-card p-0 text-card-foreground shadow-e3 backdrop:bg-black/50"
    >
      <div className="relative flex flex-col gap-3 p-4 sm:p-5">
        <button
          type="button"
          onClick={close}
          aria-label="סגירה"
          className="absolute top-2 left-2 flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-5" />
        </button>

        <span className="w-fit rounded-pill bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700">חדש ב-Cleana</span>

        {step === 0 ? (
          <>
            <h2 id="whats-new-title" className="pe-10 text-lg leading-snug font-semibold text-balance">
              קובעים חדר ישר מהלוח
            </h2>
            <div className="relative mx-auto overflow-hidden rounded-card border border-border bg-muted">
              <video
                ref={videoRef}
                src="/whats-new/schedule.mp4"
                poster="/whats-new/schedule-poster.jpg"
                width={720}
                height={1080}
                className="block h-auto max-h-[52svh] w-auto"
                muted
                loop
                playsInline
                autoPlay
                preload="auto"
              />
              <button
                type="button"
                onClick={toggleSound}
                className="absolute bottom-2 left-2 flex h-9 items-center gap-1.5 rounded-pill bg-black/65 px-3 text-xs font-semibold text-white transition-colors hover:bg-black/80"
              >
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                {muted ? "הפעלת קול" : "השתקה"}
              </button>
            </div>
            <ul className="flex flex-col gap-1 text-sm text-text-secondary">
              <li>• לחיצה על זמן פנוי פותחת הזמנה של שעה</li>
              <li>• גוררים את המסגרת כדי להזיז, מותחים מהפסים כדי להאריך או לקצר</li>
              <li>• ואז &quot;אישור הזמנה&quot; בכרטיס שנפתח — כמו תמיד</li>
            </ul>
            <div className="flex items-center justify-between gap-3">
              <Steps step={0} />
              <Button className="min-w-28" onClick={next}>
                הבא
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 id="whats-new-title" className="flex items-center gap-2 pe-10 text-lg leading-snug font-semibold">
              <svg viewBox="0 0 32 32" aria-hidden="true" className="size-7 shrink-0">
                <rect width="32" height="32" rx="9" fill="#C67139" />
                <circle cx="16" cy="16" r="7.25" fill="none" stroke="#F5E9D6" strokeWidth="3" />
              </svg>
              <span>
                חיבור ל-<span dir="ltr">Cleana+</span>
              </span>
            </h2>
            <p className="text-sm leading-relaxed text-text-secondary">
              משתמשים ב-<span dir="ltr">Cleana+</span> לזימון תורים? אחרי חיבור חד-פעמי, כל חדר שתקבעו כאן נפתח שם
              אוטומטית לתורים של לקוחות — בלי להקליד את השעות פעמיים.
            </p>
            <ul className="flex flex-col gap-1 text-sm text-text-secondary">
              <li>• מתחברים פעם אחת ב&quot;הכרטיס שלי&quot;</li>
              <li>• ב&quot;ההזמנות שלי&quot; יש כפתור לפתיחת השעות ב-<span dir="ltr">Cleana+</span></li>
              <li>• לפני ביטול או שינוי — אזהרה אם כבר נקבעו שם לקוחות</li>
            </ul>
            <p className="text-xs text-muted-foreground">Cleana לא רואה לקוחות, תשלומים או הגדרות.</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Steps step={1} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={close}>
                  הבנתי
                </Button>
                <Button asChild>
                  <Link href="/profile" onClick={close}>
                    לחיבור בכרטיס שלי
                  </Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

function Steps({ step }: { step: 0 | 1 }) {
  return (
    <span className="flex items-center gap-1.5" aria-label={`שלב ${step + 1} מתוך 2`}>
      {[0, 1].map((i) => (
        <span key={i} className={i === step ? "h-2 w-5 rounded-full bg-violet-500" : "size-2 rounded-full bg-border-strong"} />
      ))}
    </span>
  );
}
