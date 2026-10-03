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

import { loadTravelStats, loadYourTravels } from "./travel-stats-loader";

const TODAY = "2026-06-15";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadTravelStats", () => {
  it("short-circuits with zeroed stats and no further queries when the user has no Trips", async () => {
    tripMemberFindManyMock.mockResolvedValue([]);

    const stats = await loadTravelStats("user1", TODAY);

    expect(tripMemberFindManyMock).toHaveBeenCalledWith({
      where: { userId: "user1", trip: { deletedAt: null } },
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

describe("loadYourTravels", () => {
  it("short-circuits to empty stats and no map Trips when the user has no Trips", async () => {
    tripMemberFindManyMock.mockResolvedValue([]);

    const { stats, mapTrips } = await loadYourTravels("user1", TODAY);

    expect(tripFindManyMock).not.toHaveBeenCalled();
    expect(stats.trips).toEqual({ done: 0, planned: 0 });
    expect(mapTrips).toEqual([]);
  });

  it("queries every table exactly once — stats and the map share one fetch", async () => {
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "t1" }]);
    tripFindManyMock.mockResolvedValue([
      { id: "t1", name: "Japan", startDate: "2026-06-10", endDate: "2026-06-20", homeLat: -33.9, homeLng: 151.2 },
    ]);
    stopFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);

    await loadYourTravels("user1", TODAY);

    expect(tripFindManyMock).toHaveBeenCalledTimes(1);
    expect(stopFindManyMock).toHaveBeenCalledTimes(1);
    expect(transportFindManyMock).toHaveBeenCalledTimes(1);
    expect(accommodationFindManyMock).toHaveBeenCalledTimes(1);
  });

  it("orders each Trip's map points by canonical plan order (ADR 0038), located Stops only", async () => {
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "t1" }]);
    tripFindManyMock.mockResolvedValue([
      { id: "t1", name: "Japan", startDate: "2026-06-01", endDate: "2026-06-20", homeLat: null, homeLng: null },
    ]);
    stopFindManyMock.mockResolvedValue([
      // Arrangement order is Osaka, Tokyo — but Tokyo's dates come first, so
      // canonical plan order (ADR 0038) puts Tokyo's point before Osaka's.
      { id: "s-osaka", tripId: "t1", name: "Osaka", countryCode: "JP", lat: 34.69, lng: 135.5, timezone: "Asia/Tokyo", sortOrder: 0, arriveDate: "2026-06-10", departDate: "2026-06-15" },
      { id: "s-tokyo", tripId: "t1", name: "Tokyo", countryCode: "JP", lat: 35.68, lng: 139.69, timezone: "Asia/Tokyo", sortOrder: 1, arriveDate: "2026-06-01", departDate: "2026-06-10" },
      // No coordinates — omitted from the route entirely.
      { id: "s-rough", tripId: "t1", name: "Somewhere TBD", countryCode: null, lat: null, lng: null, timezone: null, sortOrder: 2, arriveDate: null, departDate: null },
    ]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);

    const { mapTrips } = await loadYourTravels("user1", TODAY);

    expect(mapTrips).toHaveLength(1);
    expect(mapTrips[0]).toMatchObject({ id: "t1", name: "Japan" });
    expect(mapTrips[0].points).toEqual([
      { lat: 35.68, lng: 139.69, name: "Tokyo" },
      { lat: 34.69, lng: 135.5, name: "Osaka" },
    ]);
  });

  it("labels each map Trip past / now / upcoming from its dates relative to today", async () => {
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "past" }, { tripId: "now" }, { tripId: "future" }]);
    tripFindManyMock.mockResolvedValue([
      { id: "past", name: "Past trip", startDate: "2026-01-01", endDate: "2026-01-05", homeLat: null, homeLng: null },
      { id: "now", name: "Current trip", startDate: "2026-06-10", endDate: "2026-06-20", homeLat: null, homeLng: null },
      { id: "future", name: "Future trip", startDate: "2027-01-01", endDate: "2027-01-05", homeLat: null, homeLng: null },
    ]);
    stopFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);

    const { mapTrips } = await loadYourTravels("user1", TODAY);

    expect(mapTrips.find((t) => t.id === "past")?.when).toBe("past");
    expect(mapTrips.find((t) => t.id === "now")?.when).toBe("now");
    expect(mapTrips.find((t) => t.id === "future")?.when).toBe("upcoming");
  });

  it("gives every map Trip a human dateLabel, falling back for undated Trips", async () => {
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "t1" }, { tripId: "t2" }]);
    tripFindManyMock.mockResolvedValue([
      { id: "t1", name: "Dated", startDate: "2026-06-10", endDate: "2026-06-20", homeLat: null, homeLng: null },
      { id: "t2", name: "Undated", startDate: null, endDate: null, homeLat: null, homeLng: null },
    ]);
    stopFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);

    const { mapTrips } = await loadYourTravels("user1", TODAY);

    expect(mapTrips.find((t) => t.id === "t1")?.dateLabel).toBe("10–20 Jun 2026");
    expect(mapTrips.find((t) => t.id === "t2")?.dateLabel).toBe("Not dated yet");
  });
});

describe("loadTravelStats (wraps loadYourTravels)", () => {
  it("still returns just the stats, for callers that only want them", async () => {
    tripMemberFindManyMock.mockResolvedValue([]);
    const stats = await loadTravelStats("user1", TODAY);
    expect(stats.trips).toEqual({ done: 0, planned: 0 });
  });
});

describe("loadYourTravels — Trip-local today (final review #12)", () => {
  it("without a pinned today, judges each Trip in its own timezone, not UTC", async () => {
    vi.useFakeTimers();
    // 23:30 UTC on 15 Jun is already 16 Jun in Auckland.
    vi.setSystemTime(new Date("2026-06-15T23:30:00Z"));
    try {
      tripMemberFindManyMock.mockResolvedValue([{ tripId: "nz" }]);
      tripFindManyMock.mockResolvedValue([
        { id: "nz", name: "NZ", startDate: "2026-06-16", endDate: "2026-06-20", homeLat: null, homeLng: null },
      ]);
      stopFindManyMock.mockResolvedValue([
        {
          id: "akl",
          tripId: "nz",
          name: "Auckland",
          countryCode: "nz",
          lat: -36.85,
          lng: 174.76,
          timezone: "Pacific/Auckland",
          sortOrder: 0,
          arriveDate: "2026-06-16",
          departDate: "2026-06-20",
        },
      ]);
      transportFindManyMock.mockResolvedValue([]);
      accommodationFindManyMock.mockResolvedValue([]);

      const { stats, mapTrips } = await loadYourTravels("user1");

      expect(stats.trips).toEqual({ done: 1, planned: 0 });
      expect(stats.places).toEqual({ done: 1, planned: 0 });
      expect(mapTrips[0].when).toBe("now");
    } finally {
      vi.useRealTimers();
    }
  });
});
