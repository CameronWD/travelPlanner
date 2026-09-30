import { describe, it, expect } from "vitest";
import { shareRefParam, shareHrefs } from "./share-ref";

describe("shareRefParam", () => {
  it("is a stable 10-char hex prefix that is not the token", () => {
    const t = "0b9f0c3e-8a51-4c43-9d59-8d1e0c6c2a11";
    expect(shareRefParam(t)).toMatch(/^[0-9a-f]{10}$/);
    expect(shareRefParam(t)).toBe(shareRefParam(t));
    expect(t).not.toContain(shareRefParam(t));
  });
});

describe("shareHrefs (ADR 0057 invite-only door)", () => {
  const t = "tok-123";
  const h = shareHrefs(t);
  it("sends Request access to the Landing's request panel with the hashed ref, never the raw token", () => {
    expect(h.requestAccess).toBe(`/?panel=request&ref=share&t=${shareRefParam(t)}`);
    expect(h.requestAccess).not.toContain(t);
  });
  it("sends Use this route through sign-in with a callbackUrl carrying fromShare", () => {
    const u = new URL(h.useRoute, "http://x");
    expect(u.pathname).toBe("/");
    expect(u.searchParams.get("panel")).toBe("sign-in");
    expect(u.searchParams.get("t")).toBe(shareRefParam(t));
    expect(u.searchParams.get("callbackUrl")).toBe("/trips/new?fromShare=tok-123");
  });
  it("start from scratch goes to a blank New trip after sign-in", () => {
    expect(new URL(h.fromScratch, "http://x").searchParams.get("callbackUrl")).toBe("/trips/new");
  });
});
