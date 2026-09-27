import { beforeEach, describe, expect, it, vi } from "vitest";

const tripMemberFindManyMock = vi.hoisted(() => vi.fn());
const tripFindManyMock = vi.hoisted(() => vi.fn());
const stopFindManyMock = vi.hoisted(() => vi.fn());
const transportFindManyMock = vi.hoisted(() => vi.fn());
const accommodationFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    tripMember: { findMany: tripMemberFindManyMock },
    trip: { findMany: tripFindManyMock },
    stop: { findMany: stopFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
  },
}));

import { loadTravelStats } from "./travel-stats-loader";

const TODAY = "2026-06-15";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadTravelStats", () => {
  it("short-circuits with zeroed stats and no further queries when the user has no Trips", async () => {
    tripMemberFindManyMock.mockResolvedValue([]);

    const stats = await loadTravelStats("user1", TODAY);

    expect(tripMemberFindManyMock).toHaveBeenCalledWith({
      where: { userId: "user1" },
      select: { tripId: true },
    });
    expect(tripFindManyMock).not.toHaveBeenCalled();
    expect(stats.trips).toEqual({ done: 0, planned: 0 });
    expect(stats.longestTrip).toBeNull();
  });

  it("scopes every query to REAL_PLAN (forkId: null)", async () => {
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "t1" }]);
    tripFindManyMock.mockResolvedValue([
      { id: "t1", name: "Japan", startDate: "2026-06-10", endDate: "2026-06-20", homeLat: -33.8688, homeLng: 151.2093 },
    ]);
    stopFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);

    await loadTravelStats("user1", TODAY);

    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
    expect(transportFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
    expect(accommodationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("resolves Transport endpoints to Stop coords or the Trip's Home base, and feeds computeTravelStats", async () => {
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "t1" }]);
    tripFindManyMock.mockResolvedValue([
      { id: "t1", name: "Japan", startDate: "2026-06-10", endDate: "2026-06-20", homeLat: -33.9, homeLng: 151.2 },
    ]);
    stopFindManyMock.mockResolvedValue([
      {
        id: "s1",
        tripId: "t1",
        name: "Tokyo",
        countryCode: "JP",
        lat: 35.68,
        lng: 139.69,
        timezone: "Asia/Tokyo",
        arriveDate: "2026-06-10",
        departDate: "2026-06-20",
      },
    ]);
    transportFindManyMock.mockResolvedValue([
      {
        tripId: "t1",
        mode: "FLIGHT",
        depAt: new Date("2026-06-10T00:30:00Z"), // 2026-06-10 09:30 JST
        fromStopId: null,
        toStopId: "s1",
        depIsHome: true,
        arrIsHome: false,
      },
    ]);
    accommodationFindManyMock.mockResolvedValue([{ tripId: "t1", checkIn: "2026-06-10", checkOut: "2026-06-20" }]);

    const stats = await loadTravelStats("user1", TODAY);

    // Home -> Tokyo leg resolved (home lat/lng as "from", Stop coords as "to"), done
    // (depAt date <= today), so it shows up in distanceKm.done and FLIGHT.done.
    expect(stats.transport.FLIGHT).toEqual({ done: 1, planned: 0 });
    expect(stats.distanceKm.done).toBeGreaterThan(0);
    expect(stats.countries.done).toEqual(["jp"]);
  });

  it("passes home: null through when the Trip has no Home base coordinates", async () => {
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "t1" }]);
    tripFindManyMock.mockResolvedValue([
      { id: "t1", name: "No home", startDate: "2026-01-01", endDate: "2026-01-05", homeLat: null, homeLng: null },
    ]);
    stopFindManyMock.mockResolvedValue([
      { id: "s1", tripId: "t1", name: "Somewhere", countryCode: "fr", lat: 1, lng: 2, timezone: null, arriveDate: "2026-01-01", departDate: "2026-01-05" },
    ]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);

    const stats = await loadTravelStats("user1", TODAY);

    expect(stats.farthestFromHome).toBeNull();
  });
});
