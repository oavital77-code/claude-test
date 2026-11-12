"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import { TIMEZONE } from "@/lib/time";
import { openBookingInCleanaPlus, type OpenInCleanaPlusResult } from "./actions";

// אחרי אישור הזמנה (סנכרון Cleana ↔ Cleana+, שלב 2):
// - מחובר/ת → השעות נפתחות לתורים ב-Cleana+ מיד, ומוצג מה נפתח.
// - לא מחובר/ת → הנעה לפעולה קטנה ושקטה: לפתוח חשבון ב-Cleana+ ולהתחבר.
// כשל כאן לא נוגע בהזמנה — היא כבר אושרה.

const HIDE_CTA_KEY = "cleana-plus-cta-hidden";

const hhmm = (iso: string) => formatInTimeZone(new Date(iso), TIMEZONE, "HH:mm");

function CleanaPlusName() {
  return <span dir="ltr">Cleana+</span>;
}

export function CleanaPlusAfterBooking({ bookingId, connected }: { bookingId: string; connected: boolean }) {
  if (!connected) return <ConnectCta />;
  return <OpenSlots bookingId={bookingId} />;
}

async function attempt(bookingId: string): Promise<OpenInCleanaPlusResult> {
  try {
    return await openBookingInCleanaPlus(bookingId);
  } catch {
    return { status: "failed" };
  }
}

/** פתיחה ותוצאה — גם אחרי קביעה וגם מהכפתור ב"ההזמנות שלי". */
export function OpenSlots({ bookingId }: { bookingId: string }) {
  // null = עדיין פותחים.
  const [result, setResult] = useState<OpenInCleanaPlusResult | null>(null);

  useEffect(() => {
    let alive = true;
    void attempt(bookingId).then((r) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, [bookingId]);

  async function retry() {
    setResult(null);
    setResult(await attempt(bookingId));
  }

  const box = "rounded-md border px-3 py-2 text-xs";

  if (!result) {
    return (
      <p className={`${box} text-muted-foreground`} role="status">
        פותחים את השעות לתורים ב-<CleanaPlusName />…
      </p>
    );
  }
  if (result.status === "not_connected") return <ConnectCta />;

  if (result.status === "failed") {
    return (
      <div className={`${box} flex flex-wrap items-center gap-2 border-destructive/30`} role="status">
        <span className="text-destructive">
          לא הצלחנו לפתוח את השעות ב-<CleanaPlusName />. ההזמנה עצמה בתוקף.
        </span>
        <Button size="sm" variant="outline" onClick={retry}>
          נסו שוב
        </Button>
      </div>
    );
  }

  if (result.status === "subscription_inactive") {
    return (
      <p className={`${box} text-muted-foreground`} role="status">
        המנוי ל-<CleanaPlusName /> לא פעיל, ולכן השעות לא נפתחו לתורים.{" "}
        <a href={result.billingUrl} target="_blank" rel="noopener" className="font-medium text-violet-600 underline">
          לחידוש המנוי
        </a>
      </p>
    );
  }

  const { opened, alreadyOpen, skipped, locationName, calendarUrl } = result;
  const taken = skipped.filter((s) => s.reason === "overlap").map((s) => hhmm(s.startsAt));
  const past = skipped.filter((s) => s.reason === "past").map((s) => hhmm(s.startsAt));
  const link = (
    <a href={calendarUrl} target="_blank" rel="noopener" className="font-medium text-violet-600 underline">
      ליומן ב-<CleanaPlusName />
    </a>
  );

  let headline: React.ReactNode;
  if (opened.length > 0) {
    headline = (
      <>
        ✓ {opened.length === 1 ? "תור אחד נפתח" : `${opened.length} תורים נפתחו`} ב-<CleanaPlusName />:{" "}
        <span dir="ltr">{opened.map(hhmm).join(", ")}</span>
      </>
    );
  } else if (alreadyOpen.length > 0) {
    headline = (
      <>
        ✓ השעות האלה כבר פתוחות לתורים ב-<CleanaPlusName />
      </>
    );
  } else if (skipped.length > 0) {
    headline = (
      <>
        לא נפתחו תורים ב-<CleanaPlusName />: השעות תפוסות אצלך או שכבר עברו.
      </>
    );
  } else {
    headline = (
      <>
        החדר קצר מאורך הטיפול שלך ב-<CleanaPlusName />, לכן לא נפתחו תורים.
      </>
    );
  }

  return (
    <div className={`${box} flex flex-col gap-1 border-emerald-600/30`} role="status">
      <span className={opened.length > 0 || alreadyOpen.length > 0 ? "text-emerald-700 dark:text-emerald-400" : ""}>
        {headline}
      </span>
      {locationName && <span className="text-muted-foreground">מיקום: {locationName}</span>}
      {taken.length > 0 && (
        <span className="text-muted-foreground">
          <span dir="ltr">{taken.join(", ")}</span> כבר תפוס אצלך, ולכן לא נפתח.
        </span>
      )}
      {past.length > 0 && (
        <span className="text-muted-foreground">
          <span dir="ltr">{past.join(", ")}</span> כבר עבר, ולכן לא נפתח.
        </span>
      )}
      <span>{link}</span>
    </div>
  );
}

/**
 * הנעה לפעולה למי שעוד לא מחובר/ת. קטנה ושקטה, עם "לא להציג שוב". ההעדפה
 * נשמרת ב-localStorage: זו העדפת תצוגה במכשיר, לא נתון אמת.
 */
function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDE_CTA_KEY) === "1";
  } catch {
    return false;
  }
}

const noSubscription = () => () => {};

function ConnectCta() {
  // בשרת: מוסתר, כדי שלא יהבהב למי שכבר ביקש/ה לא להציג.
  const storedHidden = useSyncExternalStore(noSubscription, readHidden, () => true);
  const [dismissed, setDismissed] = useState(false);

  if (storedHidden || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(HIDE_CTA_KEY, "1");
    } catch {
      // מצב פרטי וכדומה — מוסתר רק עד הרענון הבא.
    }
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <span>
        מנהלים תורים ללקוחות? ב-<CleanaPlusName /> השעות שקבעת כאן ייפתחו לתורים אוטומטית, בלי להקליד פעמיים.
      </span>
      <span className="flex flex-wrap items-center gap-3">
        <a href="/api/cleana-plus/connect" className="font-medium text-violet-600 underline">
          פתיחת חשבון וחיבור (30 יום ניסיון חינם)
        </a>
        <button type="button" onClick={dismiss} className="hover:text-foreground">
          לא להציג שוב
        </button>
      </span>
    </div>
  );
}
