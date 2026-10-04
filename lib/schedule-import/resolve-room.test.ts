import { describe, expect, it } from "vitest";
import { buildRoomResolver } from "./resolve-room";

// המצב האמיתי בפרודקשן: אותם חמישה שמות חדרים בשני הסניפים.
const ROOMS = [
  { id: "hod-1", name: "Room 1", branchName: "הוד השרון" },
  { id: "hod-3", name: "Room 3", branchName: "הוד השרון" },
  { id: "nve-1", name: "Room 1", branchName: "נווה ימין" },
  { id: "nve-3", name: "Room 3", branchName: "נווה ימין" },
  { id: "hod-podcast", name: "אולפן פודקאסט", branchName: "הוד השרון" },
];
const resolve = buildRoomResolver(ROOMS);

describe("buildRoomResolver — שמות חדרים זהים בשני סניפים", () => {
  // 🔴 הבאג: Map לפי שם בלבד שמר את החדר האחרון שנקרא, והחסימה נפלה
  // בסניף שרירותי — בלי שגיאה. ביום ההשקה זה היה חוסם את החדר הלא נכון.
  it("שם חדר שקיים בשני סניפים, בלי עמודת סניף — נדחה, לא מנחשים", () => {
    expect(resolve("Room 3", null)).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("עם עמודת סניף — החדר הנכון בכל סניף", () => {
    expect(resolve("Room 3", "הוד השרון")).toEqual({ ok: true, roomId: "hod-3" });
    expect(resolve("Room 3", "נווה ימין")).toEqual({ ok: true, roomId: "nve-3" });
  });

  it("שם חדר ייחודי — עובד גם בלי עמודת סניף (תאימות לקבצים קיימים)", () => {
    expect(resolve("אולפן פודקאסט", null)).toEqual({ ok: true, roomId: "hod-podcast" });
  });

  it("השוואה סלחנית: רווחים כפולים ורישיות", () => {
    expect(resolve("  room   3 ", " נווה  ימין ")).toEqual({ ok: true, roomId: "nve-3" });
  });

  it("סניף שלא קיים — שגיאה נפרדת מ״חדר לא קיים״", () => {
    expect(resolve("Room 3", "תל אביב")).toEqual({ ok: false, reason: "unknown_branch" });
  });

  it("חדר שלא קיים בסניף הנתון", () => {
    expect(resolve("Room 9", "הוד השרון")).toEqual({ ok: false, reason: "unknown_room" });
    expect(resolve("Room 9", null)).toEqual({ ok: false, reason: "unknown_room" });
  });

  it("חדר שקיים רק בסניף האחר — לא נופל לסניף האחר בשקט", () => {
    expect(resolve("אולפן פודקאסט", "נווה ימין")).toEqual({ ok: false, reason: "unknown_room" });
  });
});
