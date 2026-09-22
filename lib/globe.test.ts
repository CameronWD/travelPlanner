import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    globeMember: { findUnique: vi.fn() },
    globe: { create: vi.fn() },
  },
}));

vi.mock("@/lib/guards", () => ({
  requireUser: vi.fn(),
}));

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { getUserGlobe, getOrCreateUserGlobe, requireGlobeOwner } from "./globe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbm = db as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const requireUserMock = requireUser as any;

beforeEach(() => vi.clearAllMocks());

describe("getUserGlobe", () => {
  it("returns the globe id when the user is a member", async () => {
    dbm.globeMember.findUnique.mockResolvedValue({ globeId: "g1" });
    expect(await getUserGlobe("u1")).toEqual({ id: "g1" });
  });

  it("returns null when the user has no globe", async () => {
    dbm.globeMember.findUnique.mockResolvedValue(null);
    expect(await getUserGlobe("u1")).toBeNull();
  });
});

describe("getOrCreateUserGlobe", () => {
  it("returns the existing globe without creating", async () => {
    dbm.globeMember.findUnique.mockResolvedValue({ globeId: "g1" });
    const res = await getOrCreateUserGlobe("u1");
    expect(res).toEqual({ id: "g1" });
    expect(dbm.globe.create).not.toHaveBeenCalled();
  });

  it("creates a globe with the user as owner when none exists", async () => {
    dbm.globeMember.findUnique.mockResolvedValue(null);
    dbm.globe.create.mockResolvedValue({ id: "gNew" });
    const res = await getOrCreateUserGlobe("u1");
    expect(res).toEqual({ id: "gNew" });
    expect(dbm.globe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: "u1",
          members: { create: { userId: "u1", role: "owner" } },
        }),
      }),
    );
  });

  it("recovers from a P2002 create race by re-reading the globe", async () => {
    // First findUnique (initial check) returns null; second (re-read) returns the race winner's globe.
    dbm.globeMember.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ globeId: "gRace" });
    dbm.globe.create.mockRejectedValue({ code: "P2002" });
    const res = await getOrCreateUserGlobe("u1");
    expect(res).toEqual({ id: "gRace" });
  });

  it("rethrows non-P2002 errors without re-reading", async () => {
    dbm.globeMember.findUnique.mockResolvedValue(null);
    dbm.globe.create.mockRejectedValue(new Error("boom"));
    await expect(getOrCreateUserGlobe("u1")).rejects.toThrow("boom");
    // findUnique should only have been called once (the initial check — not a re-read)
    expect(dbm.globeMember.findUnique).toHaveBeenCalledTimes(1);
  });
});

// ARCH-TEN-4: direct coverage of the owner/admin gate itself, mirroring
// lib/guards.test.ts's requireTripOwner suite (the analogous per-Trip guard)
// rather than only exercising it indirectly through a mocked
// server/actions/globe.test.ts, which proves inviteToGlobe branches on
// whatever the mock returns but says nothing about whether this function
// computes the right answer.
describe("requireGlobeOwner", () => {
  const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

  afterEach(() => {
    if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
  });

  it("admits the Globe owner", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", email: "owner@example.com" });
    dbm.globeMember.findUnique.mockResolvedValue({ globeId: "g1", role: "owner" });

    await expect(requireGlobeOwner()).resolves.toEqual({
      user: { id: "u1" },
      globe: { id: "g1" },
    });
  });

  it("refuses a non-owner member", async () => {
    requireUserMock.mockResolvedValue({ id: "u2", email: "member@example.com" });
    dbm.globeMember.findUnique.mockResolvedValue({ globeId: "g1", role: "member" });

    await expect(requireGlobeOwner()).resolves.toBeNull();
  });

  it("admits a non-owner whose email is an ADMIN_EMAILS operator", async () => {
    process.env.ADMIN_EMAILS = "ops@example.com";
    requireUserMock.mockResolvedValue({ id: "u3", email: "ops@example.com" });
    dbm.globeMember.findUnique.mockResolvedValue({ globeId: "g1", role: "member" });

    await expect(requireGlobeOwner()).resolves.toEqual({
      user: { id: "u3" },
      globe: { id: "g1" },
    });
  });

  it("still refuses a non-owner whose email is not in ADMIN_EMAILS (bypass isn't always-on)", async () => {
    process.env.ADMIN_EMAILS = "ops@example.com";
    requireUserMock.mockResolvedValue({ id: "u4", email: "nobody@example.com" });
    dbm.globeMember.findUnique.mockResolvedValue({ globeId: "g1", role: "member" });

    await expect(requireGlobeOwner()).resolves.toBeNull();
  });
});
