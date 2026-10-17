// טווח השעות לבחירה בטפסים (אדמין + מטפלים): 06:00–23:30 בקפיצות של חצי
// שעה, בפורמט 24 שעות. רחב מעט מטווח התצוגה בלוח (07–22) כדי שאדמין יוכל
// לשבץ גם מוקדם/מאוחר; ה-RPCs ממילא אוכפים יישור ל-30 דקות.
const FIRST_HOUR = 6;
const LAST_HOUR = 23;

export function halfHourTimes(): string[] {
  const out: string[] = [];
  for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) {
    const hh = String(h).padStart(2, "0");
    out.push(`${hh}:00`, `${hh}:30`);
  }
  return out;
}
