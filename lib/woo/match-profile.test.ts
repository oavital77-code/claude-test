import { describe, expect, it } from "vitest";
import { findProfileByVerifiedEmail } from "./match-profile";

const PROFILE = { id: "p1", email: "dana@example.com", phone: "+972501234567" };

// לקוח מזויף מינימלי: מתעד לפי איזו עמודה חיפשו, ומחזיר את הפרופיל רק
// כשהחיפוש תואם אותו בפועל.
function fakeClient() {
  const queried: string[] = [];
  const client = {
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => {
          queried.push(column);
          const hit = (PROFILE as Record<string, string>)[column] === value;
          return { maybeSingle: async () => ({ data: hit ? { id: PROFILE.id, email: PROFILE.email } : null }) };
        },
      }),
    }),
  };
  return { client: client as unknown as Parameters<typeof findProfileByVerifiedEmail>[0], queried };
}

describe("findProfileByVerifiedEmail", () => {
  it("מוצא לפי מייל, בלי תלות באותיות גדולות/רווחים", async () => {
    const { client } = fakeClient();
    expect(await findProfileByVerifiedEmail(client, "  Dana@Example.com ")).toEqual({
      id: "p1",
      email: "dana@example.com",
    });
  });

  it("הזמנה בלי מייל לא משויכת — גם אם הטלפון שלה תואם פרופיל קיים", async () => {
    const { client, queried } = fakeClient();
    expect(await findProfileByVerifiedEmail(client, null)).toBeNull();
    expect(queried).toEqual([]);
  });

  it("לעולם לא מחפש לפי טלפון", async () => {
    const { client, queried } = fakeClient();
    await findProfileByVerifiedEmail(client, "other@example.com");
    expect(queried).toEqual(["email"]);
  });
});
