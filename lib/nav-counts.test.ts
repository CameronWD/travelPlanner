import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for loadNavCounts. Mocks: lib/db, lib/guards (requireTripAccess),
 * server/actions/stops (getTripProjection) — same style as
 * app/(app)/trips/[tripId]/summary/page.test.tsx, which exercises the same
 * detectFlags call this loader mirrors.
 */
const {
  requireTripAccessMock,
  tripFindUniqueMock,
  itemCountMock,
  stopFindManyMock,
  transportFindManyMock,
  accommodationFindManyMock,
  itemFindManyMock,
  getTripProjectionMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "u1" }, membership: {} }),
  tripFindUniqueMock: vi.fn(),
  itemCountMock: vi.fn().mockResolvedValue(0),
  stopFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn().mockResolvedValue([]),
  accommodationFindManyMock: vi.fn().mockResolvedValue([]),
  itemFindManyMock: vi.fn().mockResolvedValue([]),
  getTripProjectionMock: vi.fn().mockResolvedValue({ projectedEnd: null, hardEndDate: null }),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: tripFindUniqueMock },
    item: { count: itemCountMock, findMany: itemFindManyMock },
    stop: { findMany: stopFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
  },
}));
vi.mock("@/server/actions/stops", () => ({ getTripProjection: getTripProjectionMock }));

import { loadNavCounts } from "./nav-counts";

const DATED_STOP = {
  id: "s1",
  name: "Lisbon",
  country: "PT",
  lat: 38.7,
  lng: -9.1,
  timezone: "Europe/Lisbon",
  arriveDate: "2026-12-04",
  departDate: "2026-12-10",
  sortOrder: 0,
  pinned: false,
  nights: 6,
};

afterEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: {} });
  itemCountMock.mockResolvedValue(0);
  transportFindManyMock.mockResolvedValue([]);
  accommodationFindManyMock.mockResolvedValue([]);
  itemFindManyMock.mockResolvedValue([]);
  getTripProjectionMock.mockResolvedValue({ projectedEnd: null, hardEndDate: null });
});

describe("loadNavCounts", () => {
  it("checks trip access", async () => {
    tripFindUniqueMock.mockResolvedValue(null);
    await loadNavCounts("t1");
    expect(requireTripAccessMock).toHaveBeenCalledWith("t1");
  });

  it("is flags=0, wishlist=0 for a date-less trip (no dates yet)", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: null, endDate: null });
    itemCountMock.mockResolvedValue(0);
    const result = await loadNavCounts("t1");
    expect(result).toEqual({ flags: 0, wishlist: 0 });
    expect(stopFindManyMock).not.toHaveBeenCalled();
  });

  it("reports the Wishlist count from db.item.count scoped to the real plan and wishlist-idea predicate", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: null, endDate: null });
    itemCountMock.mockResolvedValue(4);
    const result = await loadNavCounts("t1");
    expect(result.wishlist).toBe(4);
    expect(itemCountMock).toHaveBeenCalledWith({
      where: { tripId: "t1", forkId: null, stopId: null, date: null },
    });
  });

  it("counts Flags detected on a dated trip's real plan (a stop with no accommodation)", async () => {
    tripFindUniqueMock.mockResolvedValue({
      startDate: "2026-12-04",
      endDate: "2026-12-10",
      roundTrip: false,
      homeName: null,
      homeLat: null,
      homeLng: null,
      homeCountryCode: null,
      drivingWindingFactor: null,
      drivingAvgSpeedKph: null,
    });
    itemCountMock.mockResolvedValue(2);
    stopFindManyMock
      .mockResolvedValueOnce([DATED_STOP]) // dated stops
      .mockResolvedValueOnce([]); // rough stops
    accommodationFindManyMock.mockResolvedValue([]); // no accommodation -> flagStopsWithoutAccommodation fires

    const result = await loadNavCounts("t1");

    expect(result.wishlist).toBe(2);
    expect(result.flags).toBeGreaterThan(0);
  });

  it("is flags=0 on a dated trip with nothing to flag", async () => {
    tripFindUniqueMock.mockResolvedValue({
      startDate: "2026-12-04",
      endDate: "2026-12-07",
      roundTrip: false,
      homeName: null,
      homeLat: null,
      homeLng: null,
      homeCountryCode: null,
      drivingWindingFactor: null,
      drivingAvgSpeedKph: null,
    });
    itemCountMock.mockResolvedValue(0);
    // A single 3-night stop (clears the short-stay threshold), booked
    // accommodation covering it, and an item on each day it doesn't cover —
    // no Flags should fire.
    stopFindManyMock
      .mockResolvedValueOnce([{ ...DATED_STOP, departDate: "2026-12-07", nights: 3 }])
      .mockResolvedValueOnce([]);
    accommodationFindManyMock.mockResolvedValue([
      { id: "a1", stopId: "s1", name: "Hotel", checkIn: "2026-12-04", checkOut: "2026-12-07" },
    ]);
    itemFindManyMock.mockResolvedValue([
      { id: "i1", stopId: "s1", date: "2026-12-05" },
      { id: "i2", stopId: "s1", date: "2026-12-06" },
    ]);

    const result = await loadNavCounts("t1");
    expect(result).toEqual({ flags: 0, wishlist: 0 });
  });
});
