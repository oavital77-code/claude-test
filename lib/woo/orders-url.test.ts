import { describe, expect, it } from "vitest";
import { buildOrdersUrl } from "./orders-url";

describe("buildOrdersUrl", () => {
  const since = "2026-10-31T08:00:00.000Z";

  it("ברירת מחדל: תאריך יצירה (after) — השאילתה שעבדה בבדיקה המהירה", () => {
    // אחרי המעבר ל-modified_after גם בבדיקה המהירה (31/10) היא הפסיקה לתפוס
    // הזמנות (1078, 1079 נתפסו רק ב-cron / בכלל לא).
    const url = new URL(buildOrdersUrl("https://shop.example", since, 1));
    expect(url.searchParams.get("after")).toBe(since);
    expect(url.searchParams.has("modified_after")).toBe(false);
    expect(url.searchParams.has("dates_are_gmt")).toBe(false);
  });

  it("modified: תאריך עדכון ב-GMT — לתשלום שהושלם זמן רב אחרי יצירת ההזמנה", () => {
    const url = new URL(buildOrdersUrl("https://shop.example", since, 1, "modified"));
    expect(url.searchParams.get("modified_after")).toBe(since);
    expect(url.searchParams.has("after")).toBe(false);
    expect(url.searchParams.get("dates_are_gmt")).toBe("true");
  });

  it("דפדוף ונתיב", () => {
    const url = new URL(buildOrdersUrl("https://shop.example", since, 2));
    expect(url.pathname).toBe("/wp-json/wc/v3/orders");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("100");
  });
});
