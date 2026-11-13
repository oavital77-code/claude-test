"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import { TIMEZONE } from "@/lib/time";
import { previewSlots } from "@/lib/cleana-plus/preview";
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

export function CleanaPlusAfterBooking({
  bookingId,
  connected,
  startsAt,
  endsAt,
}: {
  bookingId: string;
  connected: boolean;
  /** שעות ההזמנה שנקבעה הרגע — לתצוגה המקדימה למי שלא מחובר/ת. */
  startsAt: Date;
  endsAt: Date;
}) {
  if (!connected) return <ConnectCta startsAt={startsAt} endsAt={endsAt} />;
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

  const { opened, roomTime, alreadyOpen, skipped, locationName, calendarUrl } = result;
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
  } else if (roomTime.length > 0) {
    headline = (
      <>
        ✓ זמן החדר סומן ביומן שלך ב-<CleanaPlusName />
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
      <span
        className={
          opened.length > 0 || alreadyOpen.length > 0 || roomTime.length > 0 ? "text-emerald-700 dark:text-emerald-400" : ""
        }
      >
        {headline}
      </span>
      {locationName && <span className="text-muted-foreground">מיקום: {locationName}</span>}
      {roomTime.length > 0 && (
        <span className="text-muted-foreground">
          <span dir="ltr">{roomTime.map(hhmm).join(", ")}</span>: זמן חדר קצר מטיפול שלם. מסומן ביומן שלך ולא פתוח
          ללקוחות; אפשר לפתוח אותו שם ידנית.
        </span>
      )}
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

function ConnectCta({ startsAt, endsAt }: { startsAt?: Date; endsAt?: Date }) {
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

  const dismissLink = (
    <button type="button" onClick={dismiss} className="hover:text-foreground">
      לא להציג שוב
    </button>
  );
  // מיד אחרי קביעה: לא "יש מוצר", אלא מה היה קורה עם השעות שנקבעו הרגע.
  const slots = startsAt && endsAt ? previewSlots(startsAt, endsAt) : [];
  if (slots.length > 0) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-violet-200 bg-violet-50/60 px-3.5 py-3 text-[13px]">
        <span className="font-semibold text-foreground">
          עם <CleanaPlusName />{" "}
          {slots.length === 1 ? "היה נפתח עכשיו תור אחד ללקוחות שלך:" : `היו נפתחים עכשיו ${slots.length} תורים ללקוחות שלך:`}
        </span>
        <span dir="ltr" className="flex flex-wrap justify-end gap-1.5">
          {slots.map((slot) => (
            <span
              key={slot.startsAt.toISOString()}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs tabular-nums text-emerald-800"
            >
              {formatInTimeZone(slot.startsAt, TIMEZONE, "HH:mm")}–{formatInTimeZone(slot.endsAt, TIMEZONE, "HH:mm")}
            </span>
          ))}
        </span>
        <span className="text-muted-foreground">לקוחות קובעים בעצמם בקישור אישי, בלי להקליד את השעות פעמיים.</span>
        <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <a href="/api/cleana-plus/connect" className="font-semibold text-violet-600 underline">
            חיבור ב-30 שניות (30 יום ניסיון חינם)
          </a>
          {dismissLink}
        </span>
      </div>
    );
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
        {dismissLink}
      </span>
    </div>
  );
}
