import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  tripMemberFindMany: vi.fn(),
  tripMemberFindFirst: vi.fn(),
  upsert: vi.fn(),
  readUsageOverview: vi.fn(),
  readUsageTripReport: vi.fn(),
  prime: vi.fn(),
  revalidateAdmin: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("@/lib/db", () => ({
  db: {
    tripMember: { findMany: m.tripMemberFindMany, findFirst: m.tripMemberFindFirst },
    usageSwitch: { upsert: m.upsert },
  },
}));
vi.mock("@/lib/usage/report", () => ({
  readUsageOverview: m.readUsageOverview,
  readUsageTripReport: m.readUsageTripReport,
}));
vi.mock("@/lib/usage/switch", () => ({ primeUsageRecording: m.prime }));
vi.mock("@/lib/revalidate", () => ({ revalidateAdmin: m.revalidateAdmin }));

import { listUsageOverview, readUsageTrip, setUsageRecording } from "./usage";

const notFound = new Error("NEXT_NOT_FOUND");

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAdmin.mockResolvedValue({ id: "admin-1" });
  m.readUsageOverview.mockResolvedValue({
    recording: true,
    total: 12,
    fromOtherSites: 3,
    lastReceivedAt: new Date("2026-12-01T10:00:00.000Z"),
  });
  m.tripMemberFindMany.mockResolvedValue([
    { trip: { id: "t2", name: "Westby" } },
    { trip: { id: "t1", name: "Northvale" } },
  ]);
  m.tripMemberFindFirst.mockResolvedValue({ id: "tm1" });
  m.readUsageTripReport.mockResolvedValue({ travellers: [] });
});

describe("usage actions", () => {
  it("every action asks requireAdmin first, and a non-admin gets notFound() and no read", async () => {
    m.requireAdmin.mockRejectedValue(notFound);

    await expect(listUsageOverview()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(setUsageRecording(false)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(readUsageTrip("t1", "UTC")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(m.readUsageOverview).not.toHaveBeenCalled();
    expect(m.tripMemberFindMany).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.prime).not.toHaveBeenCalled();
    expect(m.readUsageTripReport).not.toHaveBeenCalled();
  });

  it("lists the overview with only the Admin’s own live Trips, by name, as plain values", async () => {
    const view = await listUsageOverview();

    expect(m.tripMemberFindMany).toHaveBeenCalledWith({
      where: { userId: "admin-1", trip: { deletedAt: null } },
      select: { trip: { select: { id: true, name: true } } },
    });
    expect(view).toEqual({
      recording: true,
      total: 12,
      fromOtherSites: 3,
      lastReceivedAt: "2026-12-01T10:00:00.000Z",
      trips: [
        { id: "t1", name: "Northvale" },
        { id: "t2", name: "Westby" },
      ],
    });
  });

  it("switches recording off: upserts the one row, primes it and revalidates", async () => {
    const result = await setUsageRecording(false);

    expect(result).toEqual({ success: true });
    expect(m.upsert).toHaveBeenCalledWith({
      where: { id: "usage" },
      create: { id: "usage", recording: false, updatedById: "admin-1" },
      update: { recording: false, updatedById: "admin-1" },
    });
    expect(m.prime).toHaveBeenCalledWith(false);
    expect(m.revalidateAdmin).toHaveBeenCalledTimes(1);
  });

  it("refuses anything that is not a boolean", async () => {
    const result = await setUsageRecording("off" as unknown as boolean);

    expect(result.success).toBe(false);
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.prime).not.toHaveBeenCalled();
  });

  it("reads a Trip the Admin is a Traveller of", async () => {
    const report = await readUsageTrip("t1", "Australia/Brisbane");

    expect(m.tripMemberFindFirst).toHaveBeenCalledWith({
      where: { tripId: "t1", userId: "admin-1", trip: { deletedAt: null } },
      select: { id: true },
    });
    expect(m.readUsageTripReport).toHaveBeenCalledWith("t1", "Australia/Brisbane");
    expect(report).toEqual({ travellers: [] });
  });

  it("returns null, without calling the reader, for a Trip the Admin is not on", async () => {
    m.tripMemberFindFirst.mockResolvedValue(null);

    expect(await readUsageTrip("other", "UTC")).toBeNull();
    expect(m.readUsageTripReport).not.toHaveBeenCalled();
  });
});
