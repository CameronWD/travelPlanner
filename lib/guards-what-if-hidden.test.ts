import { describe, expect, it, vi } from "vitest";

const { authMock, memberMock, forkFindUniqueMock, forkFindFirstMock, tripFindUniqueMock, itemFindUniqueMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  memberMock: vi.fn(),
  forkFindUniqueMock: vi.fn(),
  forkFindFirstMock: vi.fn(),
  tripFindUniqueMock: vi.fn(),
  itemFindUniqueMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  db: {
    tripMember: { findMany: memberMock },
    fork: { findUnique: forkFindUniqueMock, findFirst: forkFindFirstMock },
    trip: { findUnique: tripFindUniqueMock },
    item: { findUnique: itemFindUniqueMock },
  },
}));
vi.mock("@/lib/surprise-guard", () => ({ requireOutsideSurprise: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }));

import { requireForkAccess, requirePlanAccess, requireRowAccess } from "@/lib/guards";

function asMember() {
  authMock.mockResolvedValue({ user: { id: "u1" } });
  memberMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);
}

describe("What-if plans hidden (guards)", () => {
  it("requireForkAccess answers not-found for a Fork that exists", async () => {
    asMember();
    forkFindUniqueMock.mockResolvedValue({
      id: "fork-1",
      tripId: "trip-1",
      name: "Italy First",
      trip: { id: "trip-1", startDate: null, endDate: null, forksEnabled: true },
    });
    await expect(requireForkAccess("fork-1")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("requirePlanAccess answers not-found for a forkId even with Forks enabled on the trip", async () => {
    asMember();
    tripFindUniqueMock.mockResolvedValue({ forksEnabled: true });
    forkFindFirstMock.mockResolvedValue({ id: "fork-1" });
    await expect(requirePlanAccess("trip-1", "fork-1")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("requirePlanAccess still returns the real plan for a null or missing forkId", async () => {
    asMember();
    await expect(requirePlanAccess("trip-1", null)).resolves.toMatchObject({ plan: null });
    await expect(requirePlanAccess("trip-1", undefined)).resolves.toMatchObject({ plan: null });
  });

  it("requireRowAccess reads a Fork-owned Item as missing and a real-plan Item as before", async () => {
    asMember();
    const rows: Record<string, { id: string; tripId: string; forkId: string | null }> = {
      "fork-item": { id: "fork-item", tripId: "trip-1", forkId: "fork-1" },
      "real-item": { id: "real-item", tripId: "trip-1", forkId: null },
    };
    itemFindUniqueMock.mockImplementation(async ({ where }: { where: { id: string; forkId?: null } }) => {
      const row = rows[where.id];
      if (!row) return null;
      return "forkId" in where && where.forkId === null && row.forkId !== null ? null : row;
    });

    await expect(requireRowAccess("item", "fork-item")).rejects.toThrow("NEXT_NOT_FOUND");
    const real = await requireRowAccess("item", "real-item");
    expect(real.row.id).toBe("real-item");
  });
});
