import { randomInt } from "node:crypto";

// בלי תווים שמתבלבלים בהקלדה מוואטסאפ (0/O, 1/l/I).
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";

/**
 * תמיד כוללת אות גדולה, אות קטנה, ספרה וסימן (-) — עומדת בכל הגדרת חוזק
 * סיסמה אפשרית ב-Supabase Auth (אחרת updateUserById נדחה). למשל Kx7m-2Qpd.
 */
export function generateTemporaryPassword(): string {
  const from = (set: string) => set[randomInt(set.length)];
  return [from(UPPER), from(LOWER), from(DIGITS), from(LOWER), "-", from(LOWER), from(DIGITS), from(UPPER), from(LOWER)].join("");
}
