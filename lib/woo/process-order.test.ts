import { beforeEach, describe, expect, it, vi } from "vitest";

// תשלומי ססיה דרך החנות (בדיקה מעמיקה 31/10). אותה הזמנה נראית שוב ושוב
// (polling כל דקה, cron, webhook) — הבדיקות מריצות אותה כמה פעמים ומוודאות:
// בלי התראות שווא, בלי מייל "חודש בהצלחה" כפול או אחרי כשל, והתאמה למנוי
// הנכון בלבד. ה-DB מדומה עם אותה סמנטיקה כמו ה-RPCs במיגרציות.

vi.mock("server-only", () => ({}));
const sent: { to: unknown; subject: string }[] = [];
vi.mock("@/lib/email/resend", () => ({
  sendEmail: vi.fn(async (i: { to: unknown; subject: string }) => {
    sent.push({ to: i.to, subject: i.subject });
    return { ok: true };
  }),
}));
vi.mock("@/lib/email/recipients", () => ({ getAdminEmails: vi.fn(async () => ["admin@x"]) }));

const { processWooOrder } = await import("./process-order");

type Row = Record<string, unknown>;
type Payment = {
  id: string;
  user_id: string;
  type: string;
  status: string;
  amount_total: number;
  subscription_id: string;
  created_at: number;
  payplus_transaction_uid?: string | null;
};
type Sub = { id: string; status: string };

function makeDb(payments: Payment[], subs: Sub[], opts: { failRpc?: string } = {}) {
  const audit: Row[] = [];
  const rpcCalls: string[] = [];
  const get = (row: Row, col: string) => {
    if (col.includes("->>")) {
      const [base, key] = col.split("->>");
      return (row[base] as Row | undefined)?.[key];
    }
    return row[col];
  };
  const db = {
    from(table: string) {
      const filters: [string, string, unknown][] = [];
      let order: { col: string; asc: boolean } | null = null;
      let limit = Infinity;
      const rows = (): Row[] => {
        if (table === "app_settings")
          return [
            { key: "woo_session_product_id", value: 999 },
            { key: "woo_purchase_email_enabled", value: 1 },
          ];
        if (table === "profiles") return [{ id: "u1", email: "dana@x.com", role: "therapist" }];
        if (table === "payments") return payments as unknown as Row[];
        if (table === "session_subscriptions") return subs as unknown as Row[];
        if (table === "audit_log") return audit;
        return [];
      };
      const run = () => {
        let r = rows().filter((row) =>
          filters.every(([op, c, v]) => (op === "eq" ? get(row, c) === v : (v as unknown[]).includes(get(row, c)))),
        );
        if (order) {
          const o = order;
          r = [...r].sort((a, z) => (o.asc ? 1 : -1) * ((a[o.col] as number) - (z[o.col] as number)));
        }
        return { data: r.slice(0, limit), error: null };
      };
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), b),
        in: (c: string, v: unknown[]) => (filters.push(["in", c, v]), b),
        ilike: (c: string, v: string) => (filters.push(["eq", c, v.toLowerCase()]), b),
        order: (c: string, o: { ascending: boolean }) => ((order = { col: c, asc: o.ascending }), b),
        limit: (n: number) => ((limit = n), b),
        maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
        insert: async (row: Row) => {
          if (table === "audit_log") audit.push(row);
          return { data: null, error: null };
        },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
      };
      return b;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push(name);
      if (opts.failRpc === name) return { data: null, error: { message: "boom" } };
      const p = payments.find((x) => x.id === args.p_payment_id)!;
      const sub = subs.find((s) => s.id === p.subscription_id)!;
      if (name === "activate_session_payment" && p.status !== "paid") {
        if (sub.status !== "awaiting_payment") return { data: null, error: { message: "SUBSCRIPTION_NOT_AWAITING_PAYMENT" } };
        p.status = "paid";
        p.payplus_transaction_uid = args.p_transaction_uid as string;
        sub.status = "active";
      }
      if (name === "finalize_session_renewal" && p.status === "pending") {
        p.status = "paid";
        p.payplus_transaction_uid = args.p_transaction_uid as string;
        sub.status = "active";
      }
      return { data: null, error: null };
    },
  };
  return { db: db as never, audit, rpcCalls };
}

const order = (id: number) => ({
  id,
  status: "processing",
  billing: { email: "Dana@x.com" },
  line_items: [{ product_id: 999, quantity: 1, total: "600.00", total_tax: "108.00" }],
});
const unmatchedAlerts = () => sent.filter((s) => s.subject.includes("לא שויך")).length;
const renewedEmails = () => sent.filter((s) => s.to === "dana@x.com").length;

beforeEach(() => {
  sent.length = 0;
});

describe("processWooOrder — ססיה", () => {
  it("תשלום פתיחה שנראה 3 פעמים: מופעל פעם אחת, בלי התראות שווא", async () => {
    const payments: Payment[] = [
      { id: "p1", user_id: "u1", type: "session_initial", status: "pending", amount_total: 708, subscription_id: "s1", created_at: 1 },
    ];
    const subs: Sub[] = [{ id: "s1", status: "awaiting_payment" }];
    const { db, rpcCalls } = makeDb(payments, subs);
    for (let i = 0; i < 3; i++) await processWooOrder(db, order(5001));
    expect(subs[0].status).toBe("active");
    expect(rpcCalls).toEqual(["activate_session_payment"]);
    expect(unmatchedAlerts()).toBe(0);
  });

  it("חידוש שנראה 3 פעמים: מייל 'חודש' אחד בלבד", async () => {
    const payments: Payment[] = [
      { id: "r1", user_id: "u1", type: "session_recurring", status: "pending", amount_total: 708, subscription_id: "s1", created_at: 1 },
    ];
    const subs: Sub[] = [{ id: "s1", status: "active" }];
    const { db } = makeDb(payments, subs);
    for (let i = 0; i < 3; i++) await processWooOrder(db, order(5002));
    expect(renewedEmails()).toBe(1);
    expect(unmatchedAlerts()).toBe(0);
  });

  it("תשלום פתיחה ישן של בקשה שפקעה לא 'נחטף' — החידוש מוחל על המנוי הנכון", async () => {
    const payments: Payment[] = [
      { id: "old", user_id: "u1", type: "session_initial", status: "pending", amount_total: 708, subscription_id: "sOld", created_at: 1 },
      { id: "r1", user_id: "u1", type: "session_recurring", status: "pending", amount_total: 708, subscription_id: "sCur", created_at: 2 },
    ];
    const subs: Sub[] = [
      { id: "sOld", status: "expired" },
      { id: "sCur", status: "active" },
    ];
    const { db } = makeDb(payments, subs);
    await processWooOrder(db, order(5003));
    expect(subs.find((s) => s.id === "sOld")!.status).toBe("expired");
    expect(payments.find((p) => p.id === "old")!.status).toBe("pending");
    expect(payments.find((p) => p.id === "r1")!.status).toBe("paid");
    expect(renewedEmails()).toBe(1);
  });

  it("כשל ב-RPC החידוש: בלי מייל 'חודש', התראה אחת להנהלה גם אחרי כמה polls", async () => {
    const payments: Payment[] = [
      { id: "r1", user_id: "u1", type: "session_recurring", status: "pending", amount_total: 708, subscription_id: "s1", created_at: 1 },
    ];
    const { db } = makeDb(payments, [{ id: "s1", status: "active" }], { failRpc: "finalize_session_renewal" });
    for (let i = 0; i < 3; i++) await processWooOrder(db, order(5004));
    expect(renewedEmails()).toBe(0);
    expect(unmatchedAlerts()).toBe(1);
  });

  it("אין תשלום ממתין: התראה אחת להזמנה, לא בכל polling", async () => {
    const { db, audit } = makeDb([], []);
    for (let i = 0; i < 3; i++) await processWooOrder(db, order(5005));
    expect(unmatchedAlerts()).toBe(1);
    expect(audit.filter((a) => a.action === "woo_payment_unmatched")).toHaveLength(1);
  });
});
