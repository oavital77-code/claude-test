// התצוגה המקדימה בהנעה לפעולה אחרי קביעת חדר, למי שעוד לא מחובר/ת ל-Cleana+:
// אילו תורים היו נפתחים ללקוחות. אין לנו אורך טיפול של מי שלא מחובר/ת, אז
// מחשבים לפי שעה לתור — אותה חלוקה ש-Cleana+ עושה כברירת מחדל לחשבון חדש.

const HOUR_MS = 60 * 60 * 1000;

export function previewSlots(startsAt: Date, endsAt: Date): { startsAt: Date; endsAt: Date }[] {
  const slots: { startsAt: Date; endsAt: Date }[] = [];
  for (let t = startsAt.getTime(); t + HOUR_MS <= endsAt.getTime(); t += HOUR_MS) {
    slots.push({ startsAt: new Date(t), endsAt: new Date(t + HOUR_MS) });
  }
  return slots;
}
