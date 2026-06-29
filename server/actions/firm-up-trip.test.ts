import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  requireTripAccessMock,
  tripFindUniqueMock,
  stopFindManyMock,
  stopUpdateMock,
  tripUpdateMock,
  chapterUpdateMock,
  geocodeMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn(),
  tripFindUniqueMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  stopUpdateMock: vi.fn(),
  tripUpdateMock: vi.fn(),
  chapterUpdateMock: vi.fn(),
  geocodeMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/actions/activity", () => ({ recordActivity: vi.fn() }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: geocodeMock }));
vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: tripFindUniqueMock, update: tripUpdateMock },
    stop: { findMany: stopFindManyMock, update: stopUpdateMock },
    chapter: { update: chapterUpdateMock },
  },
}));

import { firmUpTrip } from "./stops";

beforeEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } });
  geocodeMock.mockResolvedValue(null);
  stopUpdateMock.mockResolvedValue({});
  tripUpdateMock.mockResolvedValue({});
});

const roughRow = (id: string, sortOrder: number, nights: number) => ({
  id, sortOrder, chapterId: null, nights, pinned: false,
  arriveDate: null, departDate: null, timezone: null, name: `Stop ${id}`, country: null,
});

describe("firmUpTrip", () => {
  it("dates every rough stop from the trip start date and grows the window", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([roughRow("a", 0, 3), roughRow("b", 1, 2)]);

    const r = await firmUpTrip("trip-1");

    expect(r.success).toBe(true);
    expect(stopUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "a" },
      data: expect.objectContaining({ arriveDate: "2026-07-01", departDate: "2026-07-04" }),
    }));
    expect(stopUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "b" },
      data: expect.objectContaining({ arriveDate: "2026-07-04", departDate: "2026-07-06" }),
    }));
    expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "trip-1" },
      data: expect.objectContaining({ endDate: "2026-07-06" }),
    }));
  });

  it("does nothing (success) when there are no rough stops", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: "2026-07-10" });
    stopFindManyMock.mockResolvedValue([
      { id: "x", sortOrder: 0, chapterId: null, nights: null, pinned: false, arriveDate: "2026-07-02", departDate: "2026-07-05", timezone: "UTC", name: "X", country: null },
    ]);

    const r = await firmUpTrip("trip-1");

    expect(r.success).toBe(true);
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("errors when the trip has no anchor (no start date, no scheduled stop)", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: null, endDate: null });
    stopFindManyMock.mockResolvedValue([roughRow("a", 0, 2)]);

    const r = await firmUpTrip("trip-1");

    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.anchorDate?.[0]).toMatch(/start date/i);
  });
});
