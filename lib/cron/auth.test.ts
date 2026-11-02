import { afterEach, describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "./auth";

describe("isAuthorizedCronRequest", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("דוחה בקשה כש-CRON_SECRET לא מוגדר בסביבה בכלל", () => {
    delete process.env.CRON_SECRET;
    const req = new Request("https://x/api/cron/foo", {
      headers: { authorization: "Bearer anything" },
    });
    expect(isAuthorizedCronRequest(req)).toBe(false);
  });

  it("דוחה בקשה בלי header authorization בכלל", () => {
    process.env.CRON_SECRET = "real-secret";
    const req = new Request("https://x/api/cron/foo");
    expect(isAuthorizedCronRequest(req)).toBe(false);
  });

  it("דוחה בקשה עם טוקן שגוי", () => {
    process.env.CRON_SECRET = "real-secret";
    const req = new Request("https://x/api/cron/foo", {
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(isAuthorizedCronRequest(req)).toBe(false);
  });

  it("מאשר בקשה עם הטוקן הנכון — התבנית ש-Vercel Cron שולח אוטומטית", () => {
    process.env.CRON_SECRET = "real-secret";
    const req = new Request("https://x/api/cron/foo", {
      headers: { authorization: "Bearer real-secret" },
    });
    expect(isAuthorizedCronRequest(req)).toBe(true);
  });
});

describe("isAuthorizedCronRequest — סוד נפרד לבדיקה כל דקה", () => {
  it("WOO_POLL_SECRET לא מתקבל כ-CRON_SECRET ולהפך", () => {
    process.env.CRON_SECRET = "cron-secret";
    process.env.WOO_POLL_SECRET = "woo-poll-secret";
    const req = (s: string) => new Request("https://x", { headers: { authorization: `Bearer ${s}` } });
    expect(isAuthorizedCronRequest(req("woo-poll-secret"), "WOO_POLL_SECRET")).toBe(true);
    expect(isAuthorizedCronRequest(req("cron-secret"), "WOO_POLL_SECRET")).toBe(false);
    expect(isAuthorizedCronRequest(req("woo-poll-secret"))).toBe(false);
    delete process.env.WOO_POLL_SECRET;
    expect(isAuthorizedCronRequest(req(""), "WOO_POLL_SECRET")).toBe(false);
  });
});
