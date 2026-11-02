import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const auth = { userId: "u1" as string | null, profile: { role: "therapist" } as { role: string } | null };
vi.mock("@/lib/auth/guards", () => ({ getAuthState: async () => auth }));
const poll = vi.fn(async () => ({ checked: 0, processed: 0 }));
vi.mock("@/lib/woo/poll", () => ({ pollWooOrders: (...a: unknown[]) => poll(...(a as [])) }));
const calls: string[] = [];
let cards: { id: string; hours_purchased: number }[] = [];
const filters: [string, unknown][] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string) => (calls.push(name), { data: null, error: null }),
    from: () => {
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (filters.push([c, v]), b),
        gt: (c: string, v: unknown) => (filters.push([c, v]), Promise.resolve({ data: cards, error: null })),
      };
      return b;
    },
  }),
}));

const { syncMyPurchases } = await import("@/app/(app)/purchase-sync-actions");
const since = "2026-11-02T06:00:00.000Z";

beforeEach(() => {
  calls.length = 0;
  filters.length = 0;
  poll.mockClear();
  cards = [];
  auth.userId = "u1";
  auth.profile = { role: "therapist" };
});

describe("syncMyPurchases", () => {
  it("בודק בחנות, זוקף, ומחזיר את השעות שנוספו מאז פתיחת המסך", async () => {
    cards = [{ id: "c1", hours_purchased: 10 }];
    const r = await syncMyPurchases({ sinceIso: since });
    expect(poll).toHaveBeenCalledWith(90, { throttleSeconds: 10 });
    expect(calls).toEqual(["claim_woo_pending_purchase", "claim_skedda_balance"]);
    expect(filters).toContainEqual(["user_id", "u1"]);
    expect(filters).toContainEqual(["purchased_at", since]);
    expect(r).toEqual({ addedHours: 10, cardIds: ["c1"] });
  });

  it("כשל מול החנות לא מונע זקיפה של רכישה שכבר נשמרה (webhook)", async () => {
    poll.mockRejectedValueOnce(new Error("timeout"));
    cards = [{ id: "c2", hours_purchased: 20 }];
    const r = await syncMyPurchases({ sinceIso: since });
    expect(calls).toContain("claim_woo_pending_purchase");
    expect(r.addedHours).toBe(20);
  });

  it("לא מחובר / אדמין / קלט לא תקין → כלום, בלי פנייה לחנות", async () => {
    auth.userId = null;
    auth.profile = null;
    expect((await syncMyPurchases({ sinceIso: since })).addedHours).toBe(0);
    auth.userId = "a1";
    auth.profile = { role: "admin" };
    expect((await syncMyPurchases({ sinceIso: since })).addedHours).toBe(0);
    auth.profile = { role: "therapist" };
    expect((await syncMyPurchases({ sinceIso: "not-a-date" })).addedHours).toBe(0);
    expect(poll).not.toHaveBeenCalled();
  });
});
