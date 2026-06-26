import { describe, expect, it } from "vitest";
import {
  detectFlags,
  flagStopsWithoutAccommodation,
  flagEmptyDays,
  flagTransportDateMismatches,
  flagVeryShortStays,
  flagRouteBacktracking,
  flagItemTimeOverlaps,
  flagPackedDays,
  flagRoughStops,
  flagSpreadDays,
  flagLongDrivingDays,
  SPREAD_DAY_THRESHOLD_KM,
  LONG_DRIVE_DAY_THRESHOLD_MIN,
  type FlagStop,
  type FlagTransport,
  type FlagAccommodation,
  type FlagItem,
} from "./flags";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const makeStop = (
  overrides: Partial<FlagStop> & Pick<FlagStop, "id" | "arriveDate" | "departDate">,
): FlagStop => ({
  name: overrides.id,
  timezone: "Europe/London",
  sortOrder: 0,
  lat: null,
  lng: null,
  ...overrides,
});

const makeTransport = (
  overrides: Partial<FlagTransport> & Pick<FlagTransport, "id">,
): FlagTransport => ({
  mode: "FLIGHT",
  fromStopId: null,
  toStopId: null,
  depAt: null,
  arrAt: null,
  ...overrides,
});

const makeAccom = (
  overrides: Partial<FlagAccommodation> & Pick<FlagAccommodation, "id" | "stopId">,
): FlagAccommodation => ({
  name: "Hotel",
  checkIn: "2026-07-01",
  checkOut: "2026-07-05",
  ...overrides,
});

const makeItem = (
  overrides: Partial<FlagItem> & Pick<FlagItem, "id">,
): FlagItem => ({
  stopId: null,
  date: null,
  startTime: null,
  endTime: null,
  lat: null,
  lng: null,
  ...overrides,
});

// Well-known stops with coords
const LONDON: FlagStop = makeStop({
  id: "london",
  name: "London",
  arriveDate: "2026-07-01",
  departDate: "2026-07-05",
  timezone: "Europe/London",
  lat: 51.5074,
  lng: -0.1278,
  sortOrder: 0,
});

const PARIS: FlagStop = makeStop({
  id: "paris",
  name: "Paris",
  arriveDate: "2026-07-06",
  departDate: "2026-07-10",
  timezone: "Europe/Paris",
  lat: 48.8566,
  lng: 2.3522,
  sortOrder: 1,
});

const ROME: FlagStop = makeStop({
  id: "rome",
  name: "Rome",
  arriveDate: "2026-07-11",
  departDate: "2026-07-15",
  timezone: "Europe/Rome",
  lat: 41.9028,
  lng: 12.4964,
  sortOrder: 2,
});


// ---------------------------------------------------------------------------
// Rule 1: Stop without accommodation
// ---------------------------------------------------------------------------

describe("flagStopsWithoutAccommodation", () => {
  it("fires a warning when a multi-night stop has no accommodation", () => {
    const stop = makeStop({ id: "s1", arriveDate: "2026-07-01", departDate: "2026-07-05" });
    const flags = flagStopsWithoutAccommodation([stop], []);
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("warning");
    expect(flags[0].targetId).toBe("s1");
    expect(flags[0].targetType).toBe("STOP");
  });

  it("does NOT fire when the stop has an accommodation", () => {
    const stop = makeStop({ id: "s1", arriveDate: "2026-07-01", departDate: "2026-07-05" });
    const accom = makeAccom({ id: "a1", stopId: "s1" });
    const flags = flagStopsWithoutAccommodation([stop], [accom]);
    expect(flags).toHaveLength(0);
  });

  it("does NOT fire for a 0-night (same-day) stop", () => {
    const stop = makeStop({ id: "s1", arriveDate: "2026-07-01", departDate: "2026-07-01" });
    const flags = flagStopsWithoutAccommodation([stop], []);
    expect(flags).toHaveLength(0);
  });

  it("fires for multiple stops that each lack accommodation", () => {
    const s1 = makeStop({ id: "s1", arriveDate: "2026-07-01", departDate: "2026-07-03" });
    const s2 = makeStop({ id: "s2", arriveDate: "2026-07-04", departDate: "2026-07-06" });
    const flags = flagStopsWithoutAccommodation([s1, s2], []);
    expect(flags).toHaveLength(2);
  });

  it("does NOT fire for the stop that has accommodation, but fires for the one that doesn't", () => {
    const s1 = makeStop({ id: "s1", arriveDate: "2026-07-01", departDate: "2026-07-03" });
    const s2 = makeStop({ id: "s2", arriveDate: "2026-07-04", departDate: "2026-07-06" });
    const accom = makeAccom({ id: "a1", stopId: "s1" });
    const flags = flagStopsWithoutAccommodation([s1, s2], [accom]);
    expect(flags).toHaveLength(1);
    expect(flags[0].targetId).toBe("s2");
  });
});

// ---------------------------------------------------------------------------
// Rule 2: Empty day
// ---------------------------------------------------------------------------

describe("flagEmptyDays", () => {
  const tripStart = "2026-07-01";
  const tripEnd = "2026-07-03";

  it("fires an info flag for each day with nothing scheduled", () => {
    const flags = flagEmptyDays([], [], [], [], tripStart, tripEnd);
    expect(flags).toHaveLength(3);
    expect(flags.every((f) => f.severity === "info")).toBe(true);
    expect(flags.map((f) => f.date)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
  });

  it("does NOT fire for a day that has an item", () => {
    const item = makeItem({ id: "i1", date: "2026-07-02" });
    const flags = flagEmptyDays([], [], [], [item], tripStart, tripEnd);
    // day 1 and day 3 still empty
    expect(flags.map((f) => f.date)).toEqual(["2026-07-01", "2026-07-03"]);
  });

  it("does NOT fire for a day that has an accommodation check-in", () => {
    const accom = makeAccom({ id: "a1", stopId: "s1", checkIn: "2026-07-01", checkOut: "2026-07-04" });
    const flags = flagEmptyDays([], [], [accom], [], tripStart, tripEnd);
    // check-in on Jul 1, check-out on Jul 4 (outside range), so Jul 1 is active
    expect(flags.map((f) => f.date)).not.toContain("2026-07-01");
    expect(flags.map((f) => f.date)).toContain("2026-07-02");
  });

  it("does NOT fire for a day that has a transport departure", () => {
    const stop = makeStop({ id: "s1", arriveDate: tripStart, departDate: tripEnd, timezone: "UTC" });
    const transport = makeTransport({
      id: "t1",
      fromStopId: "s1",
      depAt: new Date("2026-07-01T10:00:00Z"),
    });
    const flags = flagEmptyDays([stop], [transport], [], [], tripStart, tripEnd);
    expect(flags.map((f) => f.date)).not.toContain("2026-07-01");
  });

  it("returns empty array when all days have activity", () => {
    const items = [
      makeItem({ id: "i1", date: "2026-07-01" }),
      makeItem({ id: "i2", date: "2026-07-02" }),
      makeItem({ id: "i3", date: "2026-07-03" }),
    ];
    const flags = flagEmptyDays([], [], [], items, tripStart, tripEnd);
    expect(flags).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 3: Transport date mismatch
// ---------------------------------------------------------------------------

describe("flagTransportDateMismatches", () => {
  it("fires a warning when departure day is outside the fromStop date range", () => {
    const stop = makeStop({
      id: "s1",
      arriveDate: "2026-07-01",
      departDate: "2026-07-05",
      timezone: "UTC",
    });
    const transport = makeTransport({
      id: "t1",
      fromStopId: "s1",
      // depAt is AFTER the stop ends
      depAt: new Date("2026-07-10T10:00:00Z"),
    });
    const flags = flagTransportDateMismatches([stop], [transport]);
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("warning");
    expect(flags[0].targetId).toBe("t1");
    expect(flags[0].targetType).toBe("TRANSPORT");
  });

  it("does NOT fire when departure day is within the fromStop date range", () => {
    const stop = makeStop({
      id: "s1",
      arriveDate: "2026-07-01",
      departDate: "2026-07-05",
      timezone: "UTC",
    });
    const transport = makeTransport({
      id: "t1",
      fromStopId: "s1",
      depAt: new Date("2026-07-03T10:00:00Z"),
    });
    const flags = flagTransportDateMismatches([stop], [transport]);
    expect(flags).toHaveLength(0);
  });

  it("fires a warning when transport arrives after toStop's end date", () => {
    const toStop = makeStop({
      id: "s2",
      arriveDate: "2026-07-06",
      departDate: "2026-07-10",
      timezone: "UTC",
    });
    const transport = makeTransport({
      id: "t1",
      toStopId: "s2",
      depAt: new Date("2026-07-05T10:00:00Z"),
      // arrives AFTER the toStop ends
      arrAt: new Date("2026-07-11T08:00:00Z"),
    });
    const flags = flagTransportDateMismatches([toStop], [transport]);
    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("transport-arr-mismatch-t1");
  });

  it("does NOT fire when transport arrives before toStop's end date", () => {
    const toStop = makeStop({
      id: "s2",
      arriveDate: "2026-07-06",
      departDate: "2026-07-10",
      timezone: "UTC",
    });
    const transport = makeTransport({
      id: "t1",
      toStopId: "s2",
      depAt: new Date("2026-07-05T10:00:00Z"),
      arrAt: new Date("2026-07-06T08:00:00Z"),
    });
    const flags = flagTransportDateMismatches([toStop], [transport]);
    expect(flags).toHaveLength(0);
  });

  it("skips transports with no depAt", () => {
    const stop = makeStop({ id: "s1", arriveDate: "2026-07-01", departDate: "2026-07-05" });
    const transport = makeTransport({ id: "t1", fromStopId: "s1", depAt: null });
    const flags = flagTransportDateMismatches([stop], [transport]);
    expect(flags).toHaveLength(0);
  });

  it("skips transports with no fromStopId or toStopId", () => {
    const transport = makeTransport({
      id: "t1",
      depAt: new Date("2026-07-10T10:00:00Z"),
      fromStopId: null,
      toStopId: null,
    });
    const flags = flagTransportDateMismatches([], [transport]);
    expect(flags).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 4: Very short stay
// ---------------------------------------------------------------------------

describe("flagVeryShortStays", () => {
  it("fires for a 0-night (same-day) stop", () => {
    const stop = makeStop({ id: "s1", name: "Transit City", arriveDate: "2026-07-01", departDate: "2026-07-01" });
    const flags = flagVeryShortStays([stop]);
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("info");
    expect(flags[0].message).toContain("Same-day");
    expect(flags[0].targetId).toBe("s1");
  });

  it("fires for a 1-night stop", () => {
    const stop = makeStop({ id: "s1", name: "Quick Stop", arriveDate: "2026-07-01", departDate: "2026-07-02" });
    const flags = flagVeryShortStays([stop]);
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain("1 night");
  });

  it("does NOT fire for a 2-night stop", () => {
    const stop = makeStop({ id: "s1", arriveDate: "2026-07-01", departDate: "2026-07-03" });
    const flags = flagVeryShortStays([stop]);
    expect(flags).toHaveLength(0);
  });

  it("does NOT fire for a long stay", () => {
    const stop = makeStop({ id: "s1", arriveDate: "2026-07-01", departDate: "2026-07-14" });
    const flags = flagVeryShortStays([stop]);
    expect(flags).toHaveLength(0);
  });

  it("includes the stop name in the message", () => {
    const stop = makeStop({ id: "s1", name: "Lisbon", arriveDate: "2026-07-01", departDate: "2026-07-02" });
    const flags = flagVeryShortStays([stop]);
    expect(flags[0].message).toContain("Lisbon");
  });
});

// ---------------------------------------------------------------------------
// Rule 5: Route backtracking
// ---------------------------------------------------------------------------

describe("flagRouteBacktracking", () => {
  it("does NOT fire for a straightforward A→B→C progression", () => {
    // London → Paris → Rome — going southeast then further southeast = no backtrack
    const flags = flagRouteBacktracking([LONDON, PARIS, ROME]);
    expect(flags).toHaveLength(0);
  });

  it("fires when B is a clear detour that reverses toward A", () => {
    // London (sort:0) → Amsterdam (sort:1) → Rome (sort:2)
    // Amsterdam is close to London; Rome is far southeast.
    // This is NOT a backtrack (LHR→AMS→FCO is a normal routing).
    // We need a true backtrack: going London → Frankfurt → Paris → Rome
    // (Frankfurt is NE of Paris, and you then go SW back to Paris before SE to Rome)
    const FRANKFURT: FlagStop = makeStop({
      id: "frankfurt",
      name: "Frankfurt",
      arriveDate: "2026-07-06",
      departDate: "2026-07-08",
      timezone: "Europe/Berlin",
      lat: 50.1109,
      lng: 8.6821,
      sortOrder: 1,
    });
    // A=London, B=Frankfurt, C=Paris
    // Haversine: London→Frankfurt ≈ 650km, London→Paris ≈ 340km, Frankfurt→Paris ≈ 480km
    // dAB (650) > dAC (340) AND dBC (480) > dAC (340) → backtrack fires
    const flagsLFP = flagRouteBacktracking([LONDON, FRANKFURT, { ...PARIS, sortOrder: 2 }]);
    expect(flagsLFP.length).toBeGreaterThan(0);
    expect(flagsLFP[0].targetId).toBe("frankfurt");
    expect(flagsLFP[0].severity).toBe("info");
  });

  it("does NOT fire when fewer than 3 stops", () => {
    const flags = flagRouteBacktracking([LONDON, PARIS]);
    expect(flags).toHaveLength(0);
  });

  it("does NOT fire when stops are missing coords", () => {
    const stopNoCoords = makeStop({
      id: "nowhere",
      arriveDate: "2026-07-06",
      departDate: "2026-07-10",
      sortOrder: 1,
    });
    const flags = flagRouteBacktracking([LONDON, stopNoCoords, ROME]);
    expect(flags).toHaveLength(0);
  });

  it("does NOT fire for empty stops list", () => {
    const flags = flagRouteBacktracking([]);
    expect(flags).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// detectFlags: integration
// ---------------------------------------------------------------------------

describe("detectFlags", () => {
  it("returns no flags for a clean, well-planned trip", () => {
    const stops = [
      { ...LONDON, sortOrder: 0 },
      { ...PARIS, sortOrder: 1 },
    ];
    const accommodations = [
      makeAccom({ id: "a1", stopId: "london", checkIn: "2026-07-01", checkOut: "2026-07-05" }),
      makeAccom({ id: "a2", stopId: "paris", checkIn: "2026-07-06", checkOut: "2026-07-10" }),
    ];
    const items = [
      makeItem({ id: "i1", date: "2026-07-01" }),
      makeItem({ id: "i2", date: "2026-07-02" }),
      makeItem({ id: "i3", date: "2026-07-03" }),
      makeItem({ id: "i4", date: "2026-07-04" }),
      makeItem({ id: "i5", date: "2026-07-06" }),
      makeItem({ id: "i6", date: "2026-07-07" }),
      makeItem({ id: "i7", date: "2026-07-08" }),
      makeItem({ id: "i8", date: "2026-07-09" }),
    ];
    const transports = [
      makeTransport({
        id: "t1",
        fromStopId: "london",
        toStopId: "paris",
        depAt: new Date("2026-07-05T10:00:00Z"),
        arrAt: new Date("2026-07-05T12:30:00Z"),
      }),
    ];

    const flags = detectFlags({
      stops,
      transports,
      accommodations,
      items,
      tripStart: "2026-07-01",
      tripEnd: "2026-07-10",
    });

    // Transport departure is on Jul 5 which is LONDON's departDate — within range
    // Jul 5 has transport departure so not empty
    // Both stops have accommodation
    // Both stops have more than 1 night
    // No backtracking
    const warnings = flags.filter((f) => f.severity === "warning");
    expect(warnings).toHaveLength(0);
  });

  it("returns multiple flags for a poorly-planned trip", () => {
    // Single 1-night stop with no accommodation and no items
    const stop = makeStop({
      id: "s1",
      name: "Chaos City",
      arriveDate: "2026-07-01",
      departDate: "2026-07-02",
    });

    const flags = detectFlags({
      stops: [stop],
      transports: [],
      accommodations: [],
      items: [],
      tripStart: "2026-07-01",
      tripEnd: "2026-07-02",
    });

    expect(flags.length).toBeGreaterThan(0);
    // Should have: no-accommodation warning, short-stay info, and empty-day infos
    const ids = flags.map((f) => f.id);
    expect(ids.some((id) => id.startsWith("stop-no-accom"))).toBe(true);
    expect(ids.some((id) => id.startsWith("short-stay"))).toBe(true);
    expect(ids.some((id) => id.startsWith("empty-day"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 6: Item time overlap
// ---------------------------------------------------------------------------

describe("flagItemTimeOverlaps", () => {
  it("fires a warning when two timed items overlap on the same day", () => {
    const items: FlagItem[] = [
      makeItem({ id: "i1", date: "2026-07-02", startTime: "10:00", endTime: "12:00" }),
      makeItem({ id: "i2", date: "2026-07-02", startTime: "11:00", endTime: "13:00" }),
    ];
    const flags = flagItemTimeOverlaps(items);
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("warning");
    expect(flags[0].targetType).toBe("DAY");
    expect(flags[0].date).toBe("2026-07-02");
  });

  it("does NOT fire for back-to-back items that merely touch", () => {
    const items: FlagItem[] = [
      makeItem({ id: "i1", date: "2026-07-02", startTime: "10:00", endTime: "11:00" }),
      makeItem({ id: "i2", date: "2026-07-02", startTime: "11:00", endTime: "12:00" }),
    ];
    expect(flagItemTimeOverlaps(items)).toHaveLength(0);
  });

  it("ignores items without an endTime (no duration to overlap)", () => {
    const items: FlagItem[] = [
      makeItem({ id: "i1", date: "2026-07-02", startTime: "10:00" }),
      makeItem({ id: "i2", date: "2026-07-02", startTime: "10:30" }),
    ];
    expect(flagItemTimeOverlaps(items)).toHaveLength(0);
  });

  it("does not fire across different days", () => {
    const items: FlagItem[] = [
      makeItem({ id: "i1", date: "2026-07-02", startTime: "10:00", endTime: "12:00" }),
      makeItem({ id: "i2", date: "2026-07-03", startTime: "11:00", endTime: "13:00" }),
    ];
    expect(flagItemTimeOverlaps(items)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 7: Packed day
// ---------------------------------------------------------------------------

describe("flagPackedDays", () => {
  it("fires an info flag when a day has more than 6 timed items", () => {
    const items: FlagItem[] = Array.from({ length: 7 }, (_, i) =>
      makeItem({ id: `i${i}`, date: "2026-07-02", startTime: "09:00" }),
    );
    const flags = flagPackedDays(items);
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("info");
    expect(flags[0].date).toBe("2026-07-02");
  });

  it("does NOT fire at exactly 6 timed items", () => {
    const items: FlagItem[] = Array.from({ length: 6 }, (_, i) =>
      makeItem({ id: `i${i}`, date: "2026-07-02", startTime: "09:00" }),
    );
    expect(flagPackedDays(items)).toHaveLength(0);
  });

  it("counts only timed items toward the threshold", () => {
    const items: FlagItem[] = [
      ...Array.from({ length: 6 }, (_, i) => makeItem({ id: `t${i}`, date: "2026-07-02", startTime: "09:00" })),
      ...Array.from({ length: 5 }, (_, i) => makeItem({ id: `u${i}`, date: "2026-07-02" })),
    ];
    expect(flagPackedDays(items)).toHaveLength(0); // only 6 timed → not packed
  });
});

// ---------------------------------------------------------------------------
// Rule 8: Rough stops
// ---------------------------------------------------------------------------

describe("flagRoughStops", () => {
  it("returns nothing when there are no rough stops", () => {
    expect(flagRoughStops(0)).toEqual([]);
  });
  it("flags when the trip still has rough stops", () => {
    const flags = flagRoughStops(3);
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toMatch(/still rough/i);
  });
});

// ---------------------------------------------------------------------------
// Rule 9: Geographic spread day
// ---------------------------------------------------------------------------

describe("flagSpreadDays", () => {
  // Far pair: Paris city centre (48.86, 2.35) vs CDG area (49.00, 2.80)
  // haversine ≈ 43 km — well above the 25 km threshold
  const FAR_A: FlagItem = makeItem({ id: "far-a", date: "2026-07-02", lat: 48.86, lng: 2.35 });
  const FAR_B: FlagItem = makeItem({ id: "far-b", date: "2026-07-02", lat: 49.00, lng: 2.80 });

  // Compact pair: two points ~3 km apart near Paris
  // (48.860, 2.337) vs (48.858, 2.294) — haversine ≈ 3.2 km
  const CLOSE_A: FlagItem = makeItem({ id: "close-a", date: "2026-07-03", lat: 48.860, lng: 2.337 });
  const CLOSE_B: FlagItem = makeItem({ id: "close-b", date: "2026-07-03", lat: 48.858, lng: 2.294 });

  it("exports SPREAD_DAY_THRESHOLD_KM = 25", () => {
    expect(SPREAD_DAY_THRESHOLD_KM).toBe(25);
  });

  it("fires an info flag when 2 located items on the same day are > 25 km apart", () => {
    const flags = flagSpreadDays([FAR_A, FAR_B]);
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("info");
    expect(flags[0].targetType).toBe("DAY");
    expect(flags[0].date).toBe("2026-07-02");
    expect(flags[0].id).toBe("spread-day-2026-07-02");
  });

  it("does NOT fire for a compact day (items < 25 km apart)", () => {
    const flags = flagSpreadDays([CLOSE_A, CLOSE_B]);
    expect(flags).toHaveLength(0);
  });

  it("does NOT fire when a date has fewer than 2 located items", () => {
    const singleItem: FlagItem = makeItem({ id: "solo", date: "2026-07-02", lat: 48.86, lng: 2.35 });
    expect(flagSpreadDays([singleItem])).toHaveLength(0);
  });

  it("ignores items that lack lat/lng", () => {
    const noCoords: FlagItem = makeItem({ id: "nc", date: "2026-07-02" });
    const oneCoord: FlagItem = makeItem({ id: "oc", date: "2026-07-02", lat: 48.86, lng: 2.35 });
    expect(flagSpreadDays([noCoords, oneCoord])).toHaveLength(0);
  });

  it("ignores items that lack a date", () => {
    const noDate: FlagItem = makeItem({ id: "nd", lat: 48.86, lng: 2.35 });
    const withDate: FlagItem = makeItem({ id: "wd", date: "2026-07-02", lat: 48.86, lng: 2.35 });
    expect(flagSpreadDays([noDate, withDate])).toHaveLength(0);
  });

  it("produces two flags for two different spread dates", () => {
    const dayOneA: FlagItem = makeItem({ id: "d1a", date: "2026-07-02", lat: 48.86, lng: 2.35 });
    const dayOneB: FlagItem = makeItem({ id: "d1b", date: "2026-07-02", lat: 49.00, lng: 2.80 });
    const dayTwoA: FlagItem = makeItem({ id: "d2a", date: "2026-07-04", lat: 48.86, lng: 2.35 });
    const dayTwoB: FlagItem = makeItem({ id: "d2b", date: "2026-07-04", lat: 49.00, lng: 2.80 });
    const flags = flagSpreadDays([dayOneA, dayOneB, dayTwoA, dayTwoB]);
    expect(flags).toHaveLength(2);
    const dates = flags.map((f) => f.date).sort();
    expect(dates).toEqual(["2026-07-02", "2026-07-04"]);
  });
});

// ---------------------------------------------------------------------------
// Rule 10: Long driving days
// ---------------------------------------------------------------------------

describe("flagLongDrivingDays", () => {
  const stop = (id: string, lat: number, lng: number, arriveDate: string) => ({
    id, name: id, arriveDate, departDate: arriveDate, timezone: "Pacific/Auckland",
    lat, lng, sortOrder: 0,
  });
  const stops = [stop("a", -43.53, 172.63, "2026-07-02"), stop("b", -45.03, 168.66, "2026-07-03")];

  it("flags a day whose Car driving exceeds the threshold (estimate, no times)", () => {
    const flags = flagLongDrivingDays(stops, [
      { id: "t1", fromStopId: "a", toStopId: "b", mode: "CAR", depAt: null, arrAt: null },
    ], { windingFactor: 1.5, avgSpeedKph: 80 });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ targetType: "DAY", date: "2026-07-03", severity: "warning" });
  });

  it("does not flag a short Car hop", () => {
    const near = [stop("a", -45.03, 168.66, "2026-07-02"), stop("b", -45.04, 168.67, "2026-07-03")];
    expect(flagLongDrivingDays(near, [
      { id: "t1", fromStopId: "a", toStopId: "b", mode: "CAR", depAt: null, arrAt: null },
    ], { windingFactor: 1.5, avgSpeedKph: 80 })).toEqual([]);
  });

  it("ignores non-Car legs", () => {
    expect(flagLongDrivingDays(stops, [
      { id: "t1", fromStopId: "a", toStopId: "b", mode: "FLIGHT", depAt: null, arrAt: null },
    ], { windingFactor: 1.5, avgSpeedKph: 80 })).toEqual([]);
  });

  it("uses real dep/arr times when both are present", () => {
    const flags = flagLongDrivingDays(stops, [
      { id: "t1", fromStopId: "a", toStopId: "b", mode: "CAR",
        depAt: "2026-07-03T09:00:00Z", arrAt: "2026-07-03T09:30:00Z" },
    ], { windingFactor: 1.5, avgSpeedKph: 80 });
    expect(flags).toEqual([]);
  });

  it("threshold is 5 hours", () => {
    expect(LONG_DRIVE_DAY_THRESHOLD_MIN).toBe(300);
  });
});
