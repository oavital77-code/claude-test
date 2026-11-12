import { afterEach, describe, expect, it, vi } from "vitest";
import { bookedInCleanaPlus, closeSlotsInCleanaPlus, openSlotsInCleanaPlus, type OpenSlotsRequest } from "./slots";

const CONFIG = { baseUrl: "https://plus.example", clientSecret: "s" };
const REQUEST: OpenSlotsRequest = {
  bookingId: "00000000-0000-4000-8000-000000000001",
  branch: { id: "11111111-1111-4111-8111-111111111111", name: "הוד השרון", address: "הבנים 12" },
  room: "Room 3",
  startsAt: "2030-01-15T12:00:00.000Z",
  endsAt: "2030-01-15T15:00:00.000Z",
};

function reply(status: number, body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("openSlotsInCleanaPlus", () => {
  it("sends only the branch, room and hours, with the therapist's token", async () => {
    const fetchMock = reply(200, { opened: [], alreadyOpen: [], skipped: [], location: { name: "x" } });
    await openSlotsInCleanaPlus(CONFIG, "clp_tok", REQUEST);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://plus.example/api/integrations/cleana/slots");
    expect(init.headers.authorization).toBe("Bearer clp_tok");
    expect(Object.keys(JSON.parse(init.body)).sort()).toEqual(["bookingId", "branch", "endsAt", "room", "startsAt"]);
  });

  it("reads what opened and what was skipped", async () => {
    reply(200, {
      opened: ["2030-01-15T12:00:00.000Z", "2030-01-15T13:00:00.000Z"],
      alreadyOpen: [],
      skipped: [{ startsAt: "2030-01-15T14:00:00.000Z", reason: "overlap" }, { startsAt: "x", reason: "weird" }],
      location: { name: "בקליניקה — הוד השרון" },
      calendarUrl: "https://plus.example/dashboard",
    });
    expect(await openSlotsInCleanaPlus(CONFIG, "clp_tok", REQUEST)).toEqual({
      status: "opened",
      opened: ["2030-01-15T12:00:00.000Z", "2030-01-15T13:00:00.000Z"],
      roomTime: [],
      alreadyOpen: [],
      skipped: [{ startsAt: "2030-01-15T14:00:00.000Z", reason: "overlap" }],
      locationName: "בקליניקה — הוד השרון",
      calendarUrl: "https://plus.example/dashboard",
    });
  });

  it("never links the therapist to another site", async () => {
    for (const url of ["https://evil.example/", "https://plus.example.evil.com/dashboard", "javascript:alert(1)", 7]) {
      reply(200, { opened: [], calendarUrl: url });
      const result = await openSlotsInCleanaPlus(CONFIG, "clp_tok", REQUEST);
      expect(result).toMatchObject({ calendarUrl: "https://plus.example/dashboard" });
    }
  });

  it("tells a revoked link, a locked account and an outage apart", async () => {
    reply(401);
    expect(await openSlotsInCleanaPlus(CONFIG, "clp_tok", REQUEST)).toEqual({ status: "revoked" });
    reply(402);
    expect(await openSlotsInCleanaPlus(CONFIG, "clp_tok", REQUEST)).toEqual({ status: "subscription_inactive" });
    reply(500);
    expect(await openSlotsInCleanaPlus(CONFIG, "clp_tok", REQUEST)).toEqual({ status: "failed" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await openSlotsInCleanaPlus(CONFIG, "clp_tok", REQUEST)).toEqual({ status: "failed" });
  });

  it("passes the preview protection only when configured", async () => {
    let fetchMock = reply(200, {});
    await openSlotsInCleanaPlus(CONFIG, "clp_tok", REQUEST);
    expect(fetchMock.mock.calls[0][1].headers["x-vercel-protection-bypass"]).toBeUndefined();
    vi.stubEnv("CLEANA_PLUS_PROTECTION_BYPASS", "b");
    fetchMock = reply(200, {});
    await openSlotsInCleanaPlus(CONFIG, "clp_tok", REQUEST);
    expect(fetchMock.mock.calls[0][1].headers["x-vercel-protection-bypass"]).toBe("b");
  });
});

describe("bookedInCleanaPlus / closeSlotsInCleanaPlus", () => {
  it("asks for one booking's booked times", async () => {
    const fetchMock = reply(200, { booked: ["2030-01-15T13:00:00.000Z"] });
    expect(await bookedInCleanaPlus(CONFIG, "clp_tok", REQUEST.bookingId)).toEqual({
      status: "ok",
      times: ["2030-01-15T13:00:00.000Z"],
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `https://plus.example/api/integrations/cleana/slots?bookingId=${REQUEST.bookingId}`,
    );
  });

  it("closes, and reads what was closed and what has no room now", async () => {
    const fetchMock = reply(200, { closed: 2, noRoom: ["2030-01-15T13:00:00.000Z"] });
    expect(await closeSlotsInCleanaPlus(CONFIG, "clp_tok", REQUEST.bookingId)).toEqual({
      status: "closed",
      closed: 2,
      noRoom: ["2030-01-15T13:00:00.000Z"],
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ bookingId: REQUEST.bookingId });
  });

  it("reports a revoked link and an outage without throwing", async () => {
    reply(401);
    expect(await closeSlotsInCleanaPlus(CONFIG, "clp_tok", REQUEST.bookingId)).toEqual({ status: "revoked" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await bookedInCleanaPlus(CONFIG, "clp_tok", REQUEST.bookingId)).toEqual({ status: "failed" });
  });
});
