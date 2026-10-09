import { describe, expect, it, vi } from "vitest";
import { generateToken, hashToken, parseBearer, verifyToken, TOKEN_PREFIX } from "./tokens";

describe("tokens", () => {
  it("generates distinct prefixed tokens of fixed length", () => {
    const a = generateToken(), b = generateToken();
    expect(a).not.toBe(b);
    expect(a.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(a).toMatch(/^tp_[A-Za-z0-9_-]{43}$/);
  });
  it("hashes deterministically to sha256 hex", () => {
    expect(hashToken("tp_x")).toBe(hashToken("tp_x"));
    expect(hashToken("tp_x")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("parses only a Bearer header", () => {
    expect(parseBearer("Bearer tp_abc")).toBe("tp_abc");
    expect(parseBearer("bearer tp_abc")).toBe("tp_abc");
    expect(parseBearer("Basic xyz")).toBeNull();
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("Bearer ")).toBeNull();
  });
});

describe("verifyToken", () => {
  const user = { id: "u1", name: "Cam", email: "c@x.test", image: null };
  const mk = (row: unknown) => ({
    mcpToken: { findUnique: vi.fn().mockResolvedValue(row), update: vi.fn().mockResolvedValue({}) },
  });
  it("looks up by hash, never by the raw token", async () => {
    const db = mk(null);
    await verifyToken(db as never, "tp_raw");
    expect(db.mcpToken.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashToken("tp_raw") } }));
  });
  it("returns null for unknown and for revoked", async () => {
    expect(await verifyToken(mk(null) as never, "tp_a")).toBeNull();
    expect(await verifyToken(mk({ id: "t", revokedAt: new Date(), lastUsedAt: null, user }) as never, "tp_a")).toBeNull();
  });
  it("returns the user and touches lastUsedAt at most hourly", async () => {
    const now = new Date("2026-10-09T10:00:00Z");
    const fresh = mk({ id: "t", revokedAt: null, lastUsedAt: new Date("2026-10-09T09:30:00Z"), user });
    expect(await verifyToken(fresh as never, "tp_a", now)).toEqual({ user, tokenId: "t" });
    expect(fresh.mcpToken.update).not.toHaveBeenCalled();
    const stale = mk({ id: "t", revokedAt: null, lastUsedAt: new Date("2026-10-09T08:00:00Z"), user });
    await verifyToken(stale as never, "tp_a", now);
    expect(stale.mcpToken.update).toHaveBeenCalledWith({ where: { id: "t" }, data: { lastUsedAt: now } });
  });
});
