import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

// ה-webhook הוא המסלול המיידי (רכישה נזקפת באותו רגע). Woo מכבה webhook אחרי
// 5 כשלים רצופים — לכן כל מה שלא יצליח גם בניסיון חוזר מחזיר 200.
vi.mock("server-only", () => ({}));
const processWooOrder = vi.fn();
vi.mock("@/lib/woo/process-order", () => ({ processWooOrder: (...a: unknown[]) => processWooOrder(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const SECRET = "test-secret";
process.env.WOOCOMMERCE_WEBHOOK_SECRET = SECRET;
const { POST } = await import("@/app/api/woo/webhook/route");

const sign = (body: string) => createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
const req = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://x/api/woo/webhook", { method: "POST", body, headers });
const order = JSON.stringify({ id: 1080, status: "processing", billing: { email: "a@b.c" }, line_items: [] });

beforeEach(() => {
  processWooOrder.mockReset();
  processWooOrder.mockResolvedValue({ ok: true });
});

describe("POST /api/woo/webhook", () => {
  it("פינג יצירת ה-webhook (webhook_id=N, בלי חתימה) → 200, בלי עיבוד", async () => {
    const res = await POST(req("webhook_id=12"));
    expect(res.status).toBe(200);
    expect(processWooOrder).not.toHaveBeenCalled();
  });

  it("חתימה חסרה/שגויה → 401, בלי עיבוד", async () => {
    expect((await POST(req(order))).status).toBe(401);
    expect((await POST(req(order, { "x-wc-webhook-signature": sign("other") }))).status).toBe(401);
    expect(processWooOrder).not.toHaveBeenCalled();
  });

  it("הזמנה חתומה → מעובדת מיד", async () => {
    const res = await POST(req(order, { "x-wc-webhook-signature": sign(order), "x-wc-webhook-topic": "order.updated" }));
    expect(res.status).toBe(200);
    expect(processWooOrder).toHaveBeenCalledTimes(1);
    expect((processWooOrder.mock.calls[0][1] as { id: number }).id).toBe(1080);
  });

  it("דילוג שלא יצליח גם בניסיון חוזר (בלי פרטי קשר) → 200, כדי ש-Woo לא יכבה את ה-webhook", async () => {
    processWooOrder.mockResolvedValue({ ok: false, skipped: "MISSING_CONTACT_INFO" });
    const res = await POST(req(order, { "x-wc-webhook-signature": sign(order) }));
    expect(res.status).toBe(200);
  });

  it("כשל שמירה אמיתי → 500", async () => {
    processWooOrder.mockResolvedValue({ ok: false, skipped: "SAVE_FAILED" });
    const res = await POST(req(order, { "x-wc-webhook-signature": sign(order) }));
    expect(res.status).toBe(500);
  });

  it("נושא שאינו הזמנה (למשל product.updated) → 200, בלי עיבוד", async () => {
    const res = await POST(req(order, { "x-wc-webhook-signature": sign(order), "x-wc-webhook-topic": "product.updated" }));
    expect(res.status).toBe(200);
    expect(processWooOrder).not.toHaveBeenCalled();
  });
});
