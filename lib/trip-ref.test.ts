import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// trip-ref.ts imports `db` from "@/lib/db" at module scope, and lib/db.ts
// throws at import time if DATABASE_URL isn't set (it builds a real Prisma
// client). Mock it out — these tests only exercise viewerIdFromRequest,
// which never touches the DB.
vi.mock("@/lib/db", () => ({ db: {} }));

const getToken = vi.fn();
vi.mock("next-auth/jwt", () => ({ getToken: (...args: unknown[]) => getToken(...args) }));

const { viewerIdFromRequest } = await import("./trip-ref");

function request(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, { headers: cookie ? { cookie } : {} });
}

describe("viewerIdFromRequest", () => {
  beforeEach(() => {
    getToken.mockReset();
  });

  it("returns the token's id for a signed-in request", async () => {
    getToken.mockResolvedValue({ id: "user_1" });
    const id = await viewerIdFromRequest(request("https://app.example.com/trips/foo"));
    expect(id).toBe("user_1");
  });

  it("returns null when there is no token (signed out)", async () => {
    getToken.mockResolvedValue(null);
    const id = await viewerIdFromRequest(request("https://app.example.com/trips/foo"));
    expect(id).toBeNull();
  });

  it("returns null when the token has no string id", async () => {
    getToken.mockResolvedValue({ id: 42 });
    const id = await viewerIdFromRequest(request("https://app.example.com/trips/foo"));
    expect(id).toBeNull();
  });

  it("passes AUTH_SECRET, falling back to NEXTAUTH_SECRET, matching next-auth's own fallback (lib/env.js)", async () => {
    getToken.mockResolvedValue(null);
    const prevAuth = process.env.AUTH_SECRET;
    const prevNextAuth = process.env.NEXTAUTH_SECRET;
    try {
      process.env.AUTH_SECRET = "auth-secret-value";
      delete process.env.NEXTAUTH_SECRET;
      await viewerIdFromRequest(request("https://app.example.com/trips/foo"));
      expect(getToken).toHaveBeenCalledWith(expect.objectContaining({ secret: "auth-secret-value" }));

      getToken.mockClear();
      delete process.env.AUTH_SECRET;
      process.env.NEXTAUTH_SECRET = "nextauth-secret-value";
      await viewerIdFromRequest(request("https://app.example.com/trips/foo"));
      expect(getToken).toHaveBeenCalledWith(expect.objectContaining({ secret: "nextauth-secret-value" }));
    } finally {
      if (prevAuth === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = prevAuth;
      if (prevNextAuth === undefined) delete process.env.NEXTAUTH_SECRET;
      else process.env.NEXTAUTH_SECRET = prevNextAuth;
    }
  });

  it("returns null instead of throwing when getToken throws (e.g. MissingSecret)", async () => {
    getToken.mockRejectedValue(new Error("Must pass `secret` if not set to JWT getToken()"));
    const id = await viewerIdFromRequest(request("https://app.example.com/trips/foo"));
    expect(id).toBeNull();
  });

  it("treats a request carrying the __Secure- session cookie as secure, even over a plain http nextUrl (TLS-terminating proxy)", async () => {
    getToken.mockResolvedValue({ id: "user_1" });
    await viewerIdFromRequest(
      request("http://internal.example.com/trips/foo", "__Secure-authjs.session-token=abc"),
    );
    expect(getToken).toHaveBeenCalledWith(expect.objectContaining({ secureCookie: true }));
  });

  it("treats the chunked __Secure- session cookie form the same way", async () => {
    getToken.mockResolvedValue({ id: "user_1" });
    await viewerIdFromRequest(
      request("http://internal.example.com/trips/foo", "__Secure-authjs.session-token.0=abc; __Secure-authjs.session-token.1=def"),
    );
    expect(getToken).toHaveBeenCalledWith(expect.objectContaining({ secureCookie: true }));
  });

  it("does not treat a plain (non-__Secure-) session cookie as secure", async () => {
    getToken.mockResolvedValue({ id: "user_1" });
    await viewerIdFromRequest(
      request("https://app.example.com/trips/foo", "authjs.session-token=abc"),
    );
    expect(getToken).toHaveBeenCalledWith(expect.objectContaining({ secureCookie: false }));
  });

  it("is not fooled by an unrelated cookie that merely contains the secure cookie name as a substring", async () => {
    getToken.mockResolvedValue({ id: "user_1" });
    await viewerIdFromRequest(
      request("http://internal.example.com/trips/foo", "not__Secure-authjs.session-token=abc"),
    );
    expect(getToken).toHaveBeenCalledWith(expect.objectContaining({ secureCookie: false }));
  });
});
