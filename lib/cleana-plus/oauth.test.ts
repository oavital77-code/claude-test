import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken, safeEqual } from "./crypto";
import {
  authorizeUrl,
  cleanaPlusConfig,
  exchangeCode,
  newState,
  revokeToken,
  stateCookieValue,
  stateMatches,
  validCode,
  validState,
} from "./oauth";

const KEY = Buffer.alloc(32, 9).toString("base64");
const CONFIG = { baseUrl: "https://plus.example", clientSecret: "client-secret" };
const CODE = `${"a".repeat(8)}-aaaa-aaaa-aaaa-${"a".repeat(12)}.${"b".repeat(43)}`;

beforeEach(() => {
  vi.stubEnv("CLEANA_PLUS_TOKEN_KEY", KEY);
  vi.stubEnv("CLEANA_PLUS_URL", "https://plus.example/");
  vi.stubEnv("CLEANA_PLUS_CLIENT_SECRET", "client-secret");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("crypto", () => {
  it("round-trips and never contains the plaintext", () => {
    const sealed = encryptToken("clp_secret-token");
    expect(sealed).not.toContain("secret-token");
    expect(decryptToken(sealed)).toBe("clp_secret-token");
  });

  it("refuses a tampered ciphertext", () => {
    const parts = encryptToken("clp_x").split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(parts.join("."))).toThrow();
  });

  it("compares in constant time and by value", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("config", () => {
  it("needs the URL, the client secret and the key", () => {
    expect(cleanaPlusConfig()).toEqual(CONFIG);
    vi.stubEnv("CLEANA_PLUS_TOKEN_KEY", "");
    expect(cleanaPlusConfig()).toBeNull();
  });

  it("refuses plain http outside localhost", () => {
    vi.stubEnv("CLEANA_PLUS_URL", "http://plus.example");
    expect(cleanaPlusConfig()).toBeNull();
  });
});

describe("state", () => {
  it("binds the state to the user who started", () => {
    const state = newState();
    expect(validState(state)).toBe(true);
    const cookie = stateCookieValue(state, "user-1");
    expect(stateMatches(cookie, state, "user-1")).toBe(true);
    expect(stateMatches(cookie, state, "user-2")).toBe(false);
    expect(stateMatches(cookie, newState(), "user-1")).toBe(false);
    expect(stateMatches(undefined, state, "user-1")).toBe(false);
  });

  it("builds the consent URL on Cleana+", () => {
    expect(authorizeUrl(CONFIG, "s".repeat(20))).toBe(`https://plus.example/connect/cleana?state=${"s".repeat(20)}`);
  });

  it("checks the shape of a code", () => {
    expect(validCode(CODE)).toBe(true);
    expect(validCode("nope")).toBe(false);
    expect(validCode(null)).toBe(false);
  });
});

describe("exchangeCode", () => {
  it("sends the client secret and returns the token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "clp_abc.def", account_label: "a@b.c" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await exchangeCode(CONFIG, CODE)).toEqual({ ok: true, accessToken: "clp_abc.def", accountLabel: "a@b.c" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://plus.example/api/integrations/cleana/token");
    expect(init.headers.authorization).toBe("Bearer client-secret");
  });

  it("tells a rejection from an outage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 400 })));
    expect(await exchangeCode(CONFIG, CODE)).toEqual({ ok: false, reason: "rejected" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    expect(await exchangeCode(CONFIG, CODE)).toEqual({ ok: false, reason: "unavailable" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await exchangeCode(CONFIG, CODE)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("refuses a token that is not shaped like one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "x" }), { status: 200 })));
    expect(await exchangeCode(CONFIG, CODE)).toEqual({ ok: false, reason: "rejected" });
  });
});

describe("revokeToken", () => {
  it("never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await revokeToken(CONFIG, "clp_x")).toBe(false);
  });
});
