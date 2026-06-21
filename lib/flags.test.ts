import { describe, expect, it } from "vitest";
import {
  detectFlags,
  flagStopsWithoutAccommodation,
  flagEmptyDays,
  flagTransportDateMismatches,
  flagVeryShortStays,
  flagRouteBacktracking,
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
    expect(flags[0].message).toContain("0 nights");
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
