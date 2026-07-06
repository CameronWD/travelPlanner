import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { getUserGlobe, getOrCreateUserGlobe } from "./globe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbm = db as any;

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
