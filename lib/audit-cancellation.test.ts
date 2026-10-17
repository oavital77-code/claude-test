import { describe, expect, it } from "vitest";
import { cancellationDetails, type CancelledBooking } from "./audit-cancellation";

const booking: CancelledBooking = {
  user_id: "u1",
  room_id: "r3",
  source: "punch_card",
  // 25/10/2026 — אחרי מעבר לשעון חורף (UTC+2)
  starts_at: "2026-10-25T08:00:00+00:00",
  ends_at: "2026-10-25T08:30:00+00:00",
  hours_charged: 0.5,
  hours_refunded: true,
};

describe("cancellationDetails", () => {
  it("חדר, מועד בשעון ישראל, שעות והאם הוחזרו — בסדר הזה", () => {
    expect(cancellationDetails(booking, false)).toEqual({
      room_id: "r3",
      booking_slot: "25/10/2026 10:00–10:30",
      source_label: "כרטיסייה",
      hours: 0.5,
      hours_refunded: true,
    });
    expect(Object.keys(cancellationDetails(booking, false))).toEqual([
      "room_id",
      "booking_slot",
      "source_label",
      "hours",
      "hours_refunded",
    ]);
  });

  it("ביטול ע\"י אדמין — מציג גם למי ההזמנה שייכת", () => {
    expect(cancellationDetails(booking, true).user_id).toBe("u1");
    expect(Object.keys(cancellationDetails(booking, true))[0]).toBe("user_id");
  });

  it("ביטול בתוך החלון — השעות לא הוחזרו", () => {
    expect(cancellationDetails({ ...booking, hours_refunded: false }, false).hours_refunded).toBe(false);
  });

  it("ססיה — בלי שורת שעות/החזר", () => {
    const d = cancellationDetails({ ...booking, source: "session", hours_charged: 0 }, true);
    expect(d).not.toHaveProperty("hours");
    expect(d).not.toHaveProperty("hours_refunded");
    expect(d.source_label).toBe("ססיה");
  });

  it("שעון קיץ (UTC+3)", () => {
    const d = cancellationDetails(
      { ...booking, starts_at: "2026-10-21T17:30:00+00:00", ends_at: "2026-10-21T18:00:00+00:00" },
      false,
    );
    expect(d.booking_slot).toBe("21/10/2026 20:30–21:00");
  });
});
