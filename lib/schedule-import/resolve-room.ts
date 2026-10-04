/**
 * איתור החדר של שורת ייבוא — לפי סניף + שם חדר.
 *
 * 🔴 למה לא לפי שם בלבד: בשני הסניפים החדרים נקראים זהה ("Room 1"…"Room 5").
 * הגרסה הקודמת בנתה Map משם החדר ל-id, וכשאותו שם הופיע פעמיים ה-Map שמר
 * את האחרון שנקרא — החסימה נפלה בסניף שרירותי, בלי שום שגיאה. בייבוא
 * מ-Skedda ביום ההשקה זה היה חוסם את החדר הלא נכון: החדר התפוס באמת נראה
 * פנוי בלוח, והחדר הפנוי באמת נראה תפוס.
 *
 * הכלל: כשיש עמודת סניף — מחפשים בדיוק בסניף הזה. כשאין — מקבלים רק שם
 * ייחודי, ושם שקיים ביותר מסניף אחד נדחה ("ambiguous") במקום לנחש.
 */

export type RoomRef = { id: string; name: string; branchName: string };

export type RoomResolution =
  | { ok: true; roomId: string }
  | { ok: false; reason: "unknown_room" | "unknown_branch" | "ambiguous" };

/** השוואה סלחנית — רווחים כפולים/רישיות לא אמורים להפיל ייבוא. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildRoomResolver(rooms: RoomRef[]) {
  const knownBranches = new Set(rooms.map((r) => normalizeName(r.branchName)));

  return function resolve(roomName: string, branchName: string | null): RoomResolution {
    const room = normalizeName(roomName);
    const sameName = rooms.filter((r) => normalizeName(r.name) === room);

    if (branchName && branchName.trim()) {
      const branch = normalizeName(branchName);
      if (!knownBranches.has(branch)) return { ok: false, reason: "unknown_branch" };
      const match = sameName.find((r) => normalizeName(r.branchName) === branch);
      return match ? { ok: true, roomId: match.id } : { ok: false, reason: "unknown_room" };
    }

    if (sameName.length === 0) return { ok: false, reason: "unknown_room" };
    if (sameName.length > 1) return { ok: false, reason: "ambiguous" };
    return { ok: true, roomId: sameName[0].id };
  };
}
