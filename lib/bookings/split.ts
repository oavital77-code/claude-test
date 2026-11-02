type Splittable = { status: string; starts_at: string; ends_at: string };

/**
 * חלוקת ההזמנות של מטפל/ת ל"קרובות" ו"היסטוריה".
 * - קרובות = confirmed שעוד לא *הסתיימה* (ends_at > now) — כולל מפגש שמתקיים
 *   עכשיו. קודם הסינון היה לפי starts_at, ומפגש ססיה של 14:00–20:00 נעלם
 *   מ"קרובות" כבר ב-14:00 (חופית, 02/11).
 * - קרובות ממוינות מהקרובה לרחוקה; היסטוריה מהחדשה לישנה. קודם הכל היה
 *   בסדר יורד — עם מפגשי ססיה שנוצרים 90 יום קדימה, ההזמנה של היום הייתה
 *   בתחתית הרשימה.
 */
export function splitBookings<T extends Splittable>(bookings: T[], now: Date): { upcoming: T[]; history: T[] } {
  const t = now.getTime();
  const isUpcoming = (b: T) => b.status === "confirmed" && new Date(b.ends_at).getTime() > t;
  const upcoming = bookings
    .filter(isUpcoming)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const history = bookings
    .filter((b) => !isUpcoming(b))
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
  return { upcoming, history };
}

export function isInProgress(b: Splittable, now: Date): boolean {
  const t = now.getTime();
  return b.status === "confirmed" && new Date(b.starts_at).getTime() <= t && new Date(b.ends_at).getTime() > t;
}
