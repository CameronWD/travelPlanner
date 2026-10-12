import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { serializeSignedCookie } from "better-call";

// trip-ref.ts imports `db` from "@/lib/db" at module scope, and lib/db.ts
// throws at import time if DATABASE_URL isn't set (it builds a real Prisma
// client). Mock it out — these tests only exercise viewerIdFromRequest,
// which never touches the DB.
const findSession = vi.fn();
vi.mock("@/lib/db", () => ({ db: { authSession: { findUnique: (...args: unknown[]) => findSession(...args) } } }));

const getCookieCache = vi.fn();
vi.mock("better-auth/cookies", async (importOriginal) => ({
  ...(await importOriginal<typeof import("better-auth/cookies")>()),
  getCookieCache: (...args: unknown[]) => getCookieCache(...args),
}));

const { viewerIdFromRequest } = await import("./trip-ref");

function request(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, { headers: cookie ? { cookie } : {} });
}

describe("viewerIdFromRequest", () => {
  beforeEach(() => {
    getCookieCache.mockReset();
    findSession.mockReset();
  });

  it("returns the cached session's user id for a signed-in request", async () => {
    getCookieCache.mockResolvedValue({ user: { id: "user_1" } });
    const id = await viewerIdFromRequest(request("https://app.example.com/trips/foo"));
    expect(id).toBe("user_1");
  });

  it("returns null when there is no cached session (signed out)", async () => {
    getCookieCache.mockResolvedValue(null);
    const id = await viewerIdFromRequest(request("https://app.example.com/trips/foo"));
    expect(id).toBeNull();
  });

  it("returns null when the cached user has no string id", async () => {
    getCookieCache.mockResolvedValue({ user: { id: 42 } });
    const id = await viewerIdFromRequest(request("https://app.example.com/trips/foo"));
    expect(id).toBeNull();
  });

  it("passes BETTER_AUTH_SECRET, falling back to AUTH_SECRET", async () => {
    getCookieCache.mockResolvedValue(null);
    const prevBetter = process.env.BETTER_AUTH_SECRET;
    const prevAuth = process.env.AUTH_SECRET;
    try {
      process.env.BETTER_AUTH_SECRET = "better-auth-secret-value";
      delete process.env.AUTH_SECRET;
      await viewerIdFromRequest(request("https://app.example.com/trips/foo"));
      expect(getCookieCache).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ secret: "better-auth-secret-value" }),
      );

      getCookieCache.mockClear();
      delete process.env.BETTER_AUTH_SECRET;
      process.env.AUTH_SECRET = "auth-secret-value";
      await viewerIdFromRequest(request("https://app.example.com/trips/foo"));
      expect(getCookieCache).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ secret: "auth-secret-value" }),
      );
    } finally {
      if (prevBetter === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = prevBetter;
      if (prevAuth === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = prevAuth;
    }
  });

  it("returns null instead of throwing when getCookieCache throws", async () => {
    getCookieCache.mockRejectedValue(new Error("bad cookie"));
    const id = await viewerIdFromRequest(request("https://app.example.com/trips/foo"));
    expect(id).toBeNull();
  });

  describe("falls back to the session when the cookie cache is gone", () => {
    const SECRET = "test-secret-for-session-fallback";
    let prevBetter: string | undefined;

    beforeEach(() => {
      prevBetter = process.env.BETTER_AUTH_SECRET;
      process.env.BETTER_AUTH_SECRET = SECRET;
      getCookieCache.mockResolvedValue(null);
      return () => {
        if (prevBetter === undefined) delete process.env.BETTER_AUTH_SECRET;
        else process.env.BETTER_AUTH_SECRET = prevBetter;
      };
    });

    /** The cookie value exactly as Better Auth sets it (better-call's setSignedCookie). */
    async function signed(token: string, secret = SECRET): Promise<string> {
      const header = await serializeSignedCookie("x", token, secret);
      return header.slice(2).split(";")[0];
    }

    it("returns the session's user id for a valid session_token", async () => {
      findSession.mockResolvedValue({ userId: "user_2", expiresAt: new Date(Date.now() + 60_000) });
      const cookie = `better-auth.session_token=${await signed("tok_abc")}`;
      const id = await viewerIdFromRequest(request("https://app.example.com/trips/foo", cookie));
      expect(id).toBe("user_2");
      expect(findSession).toHaveBeenCalledWith({ where: { token: "tok_abc" }, select: { userId: true, expiresAt: true } });
    });

    it("reads the __Secure- cookie too (production)", async () => {
      findSession.mockResolvedValue({ userId: "user_3", expiresAt: new Date(Date.now() + 60_000) });
      const cookie = `__Secure-better-auth.session_token=${await signed("tok_sec")}`;
      expect(await viewerIdFromRequest(request("https://app.example.com/trips/foo", cookie))).toBe("user_3");
    });

    it("returns null for an expired session", async () => {
      findSession.mockResolvedValue({ userId: "user_2", expiresAt: new Date(Date.now() - 1000) });
      const cookie = `better-auth.session_token=${await signed("tok_old")}`;
      expect(await viewerIdFromRequest(request("https://app.example.com/trips/foo", cookie))).toBeNull();
    });

    it("returns null when no session row matches", async () => {
      findSession.mockResolvedValue(null);
      const cookie = `better-auth.session_token=${await signed("tok_gone")}`;
      expect(await viewerIdFromRequest(request("https://app.example.com/trips/foo", cookie))).toBeNull();
    });

    it("returns null for a garbage cookie, without a lookup", async () => {
      const id = await viewerIdFromRequest(request("https://app.example.com/trips/foo", "better-auth.session_token=garbage"));
      expect(id).toBeNull();
      expect(findSession).not.toHaveBeenCalled();
    });

    it("returns null for a token signed with another secret, without a lookup", async () => {
      const cookie = `better-auth.session_token=${await signed("tok_abc", "some-other-secret")}`;
      expect(await viewerIdFromRequest(request("https://app.example.com/trips/foo", cookie))).toBeNull();
      expect(findSession).not.toHaveBeenCalled();
    });

    it("returns null when the lookup throws", async () => {
      findSession.mockRejectedValue(new Error("db down"));
      const cookie = `better-auth.session_token=${await signed("tok_abc")}`;
      expect(await viewerIdFromRequest(request("https://app.example.com/trips/foo", cookie))).toBeNull();
    });
  });
});
