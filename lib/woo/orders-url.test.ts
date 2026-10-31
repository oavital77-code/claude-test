import { describe, expect, it } from "vitest";
import { buildOrdersUrl } from "./orders-url";

describe("buildOrdersUrl", () => {
  const url = new URL(buildOrdersUrl("https://shop.example", "2026-10-31T08:00:00.000Z", 2));

  it("מסנן לפי תאריך עדכון ולא לפי תאריך יצירה", () => {
    // `after` ב-Woo = תאריך יצירה: הזמנה ששולמה/סומנה כשולמה זמן רב אחרי
    // שנוצרה (on-hold → processing, תשלום חוזר) לא נתפסה בחלון.
    expect(url.searchParams.get("modified_after")).toBe("2026-10-31T08:00:00.000Z");
    expect(url.searchParams.has("after")).toBe(false);
    expect(url.searchParams.get("dates_are_gmt")).toBe("true");
  });

  it("דפדוף ונתיב", () => {
    expect(url.pathname).toBe("/wp-json/wc/v3/orders");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("100");
  });
});
