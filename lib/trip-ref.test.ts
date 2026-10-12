import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// trip-ref.ts imports `db` from "@/lib/db" at module scope, and lib/db.ts
// throws at import time if DATABASE_URL isn't set (it builds a real Prisma
// client). Mock it out — these tests only exercise viewerIdFromRequest,
// which never touches the DB.
vi.mock("@/lib/db", () => ({ db: {} }));

const getCookieCache = vi.fn();
vi.mock("better-auth/cookies", () => ({ getCookieCache: (...args: unknown[]) => getCookieCache(...args) }));

const { viewerIdFromRequest } = await import("./trip-ref");

function request(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, { headers: cookie ? { cookie } : {} });
}

describe("viewerIdFromRequest", () => {
  beforeEach(() => {
    getCookieCache.mockReset();
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
});
