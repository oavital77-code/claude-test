import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { sendEmail } = await import("./resend");

const input = { to: "t@example.com", subject: "אישור הזמנה — דנה כהן", html: "<p>x</p>" };

describe("sendEmail — ניסיון חוזר", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("ניתוק רשת (fetch failed) → ניסיון נוסף מצליח, עם אותו Idempotency-Key", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendEmail(input);

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const keys = fetchMock.mock.calls.map((c) => (c[1].headers as Record<string, string>)["Idempotency-Key"]);
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]);
  });

  it("5xx/429 → ניסיון נוסף", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail(input)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("4xx (שגיאת תוכן) → בלי ניסיון נוסף", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail(input)).toEqual({ ok: false, error: "RESEND_422" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("שני כישלונות → מחזיר כישלון, לא זורק", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendEmail(input);
    expect(res.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("הלוג לא כולל את נושא המייל (שמכיל שם — PII)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 422 })));
    await sendEmail(input);
    const logged = errorSpy.mock.calls.flat().map(String).join(" ");
    expect(logged).not.toContain("דנה כהן");
  });
});
