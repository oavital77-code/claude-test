import { bypassHeaders, type CleanaPlusConfig } from "./oauth";

// פתיחת תורים ב-Cleana+ לחדר שהמטפל/ת קבע/ה ב-Cleana (שלב 2 באפיון הסנכרון).
// נשלחים רק סניף, חדר ושעות. לא שמות, לא יתרות, לא מידע על מטפלים אחרים
// (חוק ברזל #3). Cleana+ מחזירה רק אילו משבצות נפתחו ואילו לא.
//
// כשל כאן לעולם לא נוגע בהזמנה עצמה: ההזמנה כבר אושרה לפני הקריאה, וכל
// תוצאה שלילית מוחזרת כערך.

const TIMEOUT_MS = 8000;

export type OpenSlotsRequest = {
  bookingId: string;
  branch: { id: string; name: string; address: string };
  room: string;
  startsAt: string;
  endsAt: string;
  /** ההזמנה הוזזה: מזהה ההזמנה שהשעות האלה מחליפות (אותו מזהה אם לא השתנה). */
  replacesBookingId?: string;
};

export type OpenSlotsOutcome =
  | {
      status: "opened";
      opened: string[];
      /** זמן חדר קצר מטיפול שלם: מסומן ביומן המטפל/ת ב-Cleana+, לא פתוח ללקוחות. */
      roomTime: string[];
      alreadyOpen: string[];
      skipped: { startsAt: string; reason: "overlap" | "past" }[];
      locationName: string;
      calendarUrl: string;
    }
  | { status: "revoked" }
  | { status: "subscription_inactive" }
  | { status: "failed" };

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** The URL, only if it is on Cleana+ itself. A prefix check would let "…cleanagroup.app.evil.com" through. */
function sameOrigin(value: unknown, origin: string): string | null {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).origin === origin ? value : null;
  } catch {
    return null;
  }
}

export async function openSlotsInCleanaPlus(
  config: CleanaPlusConfig,
  accessToken: string,
  request: OpenSlotsRequest,
): Promise<OpenSlotsOutcome> {
  try {
    const res = await fetch(new URL("/api/integrations/cleana/slots", config.baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        ...bypassHeaders(),
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 401) return { status: "revoked" };
    if (res.status === 402) return { status: "subscription_inactive" };
    if (!res.ok) return { status: "failed" };

    const body = (await res.json()) as Record<string, unknown>;
    const location = body.location as { name?: unknown } | undefined;
    const skipped: { startsAt: string; reason: "overlap" | "past" }[] = Array.isArray(body.skipped)
      ? body.skipped.flatMap((s: unknown) => {
          const item = s as { startsAt?: unknown; reason?: unknown };
          return typeof item?.startsAt === "string" && (item.reason === "overlap" || item.reason === "past")
            ? [{ startsAt: item.startsAt, reason: item.reason as "overlap" | "past" }]
            : [];
        })
      : [];
    const calendarUrl = sameOrigin(body.calendarUrl, config.baseUrl) ?? `${config.baseUrl}/dashboard`;

    return {
      status: "opened",
      opened: stringArray(body.opened),
      roomTime: stringArray(body.roomTime),
      alreadyOpen: stringArray(body.alreadyOpen),
      skipped,
      locationName: typeof location?.name === "string" ? location.name.slice(0, 80) : "",
      calendarUrl,
    };
  } catch {
    return { status: "failed" };
  }
}

export type BookedCheck = { status: "ok"; times: string[] } | { status: "revoked" } | { status: "failed" };

/** אילו משבצות של ההזמנה לקוח/ה כבר קבע/ה ב-Cleana+. שעות בלבד, בלי שמות. */
export async function bookedInCleanaPlus(
  config: CleanaPlusConfig,
  accessToken: string,
  bookingId: string,
): Promise<BookedCheck> {
  try {
    const url = new URL("/api/integrations/cleana/slots", config.baseUrl);
    url.searchParams.set("bookingId", bookingId);
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}`, ...bypassHeaders() },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 401) return { status: "revoked" };
    if (!res.ok) return { status: "failed" };
    const body = (await res.json()) as { booked?: unknown };
    return { status: "ok", times: stringArray(body.booked) };
  } catch {
    return { status: "failed" };
  }
}

export type CloseOutcome =
  | { status: "closed"; closed: number; noRoom: string[] }
  | { status: "revoked" }
  | { status: "failed" };

/** החדר בוטל או הוזז: סגירת המשבצות הפנויות, וסימון "אין חדר" על תורים שנקבעו. */
export async function closeSlotsInCleanaPlus(
  config: CleanaPlusConfig,
  accessToken: string,
  bookingId: string,
): Promise<CloseOutcome> {
  try {
    const res = await fetch(new URL("/api/integrations/cleana/slots/close", config.baseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...bypassHeaders() },
      body: JSON.stringify({ bookingId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 401) return { status: "revoked" };
    if (!res.ok) return { status: "failed" };
    const body = (await res.json()) as { closed?: unknown; noRoom?: unknown };
    return {
      status: "closed",
      closed: typeof body.closed === "number" ? body.closed : 0,
      noRoom: stringArray(body.noRoom),
    };
  } catch {
    return { status: "failed" };
  }
}
