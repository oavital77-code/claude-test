import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async () => ({ data: null, error: null }));
const pending: (() => Promise<void>)[] = [];
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => Promise<void>) => pending.push(fn),
}));

const { GET } = await import("@/app/api/go/[link]/route");
const call = (link: string) => GET(new Request(`https://x/api/go/${link}`), { params: Promise.resolve({ link }) });

beforeEach(() => {
  rpc.mockClear();
  pending.length = 0;
});

describe("/api/go/[link]", () => {
  it("Cleana+: מפנה לדף הנחיתה וסופר לחיצה", async () => {
    const res = await call("cleana-plus");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://cleanaplus.cleanagroup.app/");
    await Promise.all(pending.map((f) => f()));
    expect(rpc).toHaveBeenCalledWith("record_link_click", { p_link: "cleana_plus" });
  });

  it("באנר: מפנה לקישור השותפים של PayPlus", async () => {
    const res = await call("promo-sidebar");
    expect(res.headers.get("location")).toMatch(/^https:\/\/aff\.pays\.plus\//);
    await Promise.all(pending.map((f) => f()));
    expect(rpc).toHaveBeenCalledWith("record_link_click", { p_link: "promo_sidebar" });
  });

  it("קישור לא מוכר: 404, בלי הפניה ובלי ספירה (אין open redirect)", async () => {
    for (const bad of ["evil", "https:%2F%2Fevil.com", "__proto__", "toString"]) {
      const res = await call(bad);
      expect(res.status).toBe(404);
      expect(res.headers.get("location")).toBeNull();
    }
    expect(pending).toHaveLength(0);
  });

  it("כשל ברישום לא חוסם את ההפניה", async () => {
    rpc.mockRejectedValueOnce(new Error("db down"));
    const res = await call("promo-bottom");
    expect(res.status).toBe(302);
    await expect(Promise.all(pending.map((f) => f()))).resolves.toBeDefined();
  });
});
