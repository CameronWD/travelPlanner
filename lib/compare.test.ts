/**
 * Tests for computePlanMetrics and diffMetrics.
 *
 * TDD: tests written first (RED), then implementation (GREEN).
 */

import { describe, expect, it } from "vitest";
import {
  computePlanMetrics,
  diffMetrics,
  diffRoute,
  type PlanMetricsInput,
  type PlanMetrics,
} from "./compare";

// ---------------------------------------------------------------------------
// Minimal fixture builders
// ---------------------------------------------------------------------------

const makeStop = (
  id: string,
  overrides: Partial<{
    name: string;
    country: string | null;
    nights: number | null;
    sortOrder: number;
    arriveDate: string | null;
    departDate: string | null;
    pinned: boolean;
    lat: number | null;
    lng: number | null;
    timezone: string;
  }> = {},
) => {
  const nights = "nights" in overrides ? overrides.nights as number | null : 2;
  return {
    id,
    name: overrides.name ?? id,
    country: overrides.country !== undefined ? overrides.country : null,
    nights,
    sortOrder: overrides.sortOrder ?? 0,
    arriveDate: overrides.arriveDate ?? null,
    departDate: overrides.departDate ?? null,
    pinned: overrides.pinned ?? false,
    lat: overrides.lat ?? null,
    lng: overrides.lng ?? null,
    timezone: overrides.timezone ?? "UTC",
  };
};

const makeTransport = (
  id: string,
  overrides: Partial<{
    mode: string;
    fromStopId: string | null;
    toStopId: string | null;
    depAt: string | null;
    arrAt: string | null;
  }> = {},
) => ({
  id,
  mode: overrides.mode ?? "FLIGHT",
  fromStopId: overrides.fromStopId ?? null,
  toStopId: overrides.toStopId ?? null,
  depAt: overrides.depAt ?? null,
  arrAt: overrides.arrAt ?? null,
});

const makeAccom = (
  id: string,
  stopId: string,
  overrides: Partial<{
    checkIn: string;
    checkOut: string;
    name: string;
  }> = {},
) => ({
  id,
  stopId,
  name: overrides.name ?? "Hotel",
  checkIn: overrides.checkIn ?? "2026-07-01",
  checkOut: overrides.checkOut ?? "2026-07-03",
});

const makeItem = (
  id: string,
  overrides: Partial<{
    stopId: string | null;
    date: string | null;
    startTime: string | null;
    endTime: string | null;
    lat: number | null;
    lng: number | null;
    category: string;
  }> = {},
) => ({
  id,
  stopId: overrides.stopId ?? null,
  date: overrides.date ?? null,
  startTime: overrides.startTime ?? null,
  endTime: overrides.endTime ?? null,
  lat: overrides.lat ?? null,
  lng: overrides.lng ?? null,
  category: overrides.category ?? "SIGHTSEEING",
});

const makeCost = (
  id: string,
  overrides: Partial<{
    estimatedMinor: number;
    actualMinor: number | null;
    currency: string;
    rateToHome: number | null;
    ownerType: "TRANSPORT" | "ACCOMMODATION" | "ITEM" | "OTHER";
    ownerId: string | null;
    label: string | null;
    category: string | null;
  }> = {},
) => ({
  id,
  estimatedMinor: overrides.estimatedMinor ?? 10000,
  actualMinor: overrides.actualMinor ?? null,
  currency: overrides.currency ?? "USD",
  rateToHome: overrides.rateToHome ?? 1,
  ownerType: overrides.ownerType ?? ("OTHER" as const),
  ownerId: overrides.ownerId ?? null,
  label: overrides.label ?? null,
  category: overrides.category ?? null,
});

const makeTrip = (overrides: Partial<{
  startDate: string | null;
  hardEndDate: string | null;
  homeCurrency: string;
  drivingWindingFactor: number;
  drivingAvgSpeedKph: number;
}> = {}) => ({
  startDate: overrides.startDate ?? "2026-07-01",
  hardEndDate: overrides.hardEndDate ?? null,
  homeCurrency: overrides.homeCurrency ?? "USD",
  drivingWindingFactor: overrides.drivingWindingFactor ?? 1.4,
  drivingAvgSpeedKph: overrides.drivingAvgSpeedKph ?? 80,
});

/** Minimal valid PlanMetricsInput with no stops, transports, etc. */
const emptyInput = (): PlanMetricsInput => ({
  stops: [],
  transports: [],
  accommodations: [],
  items: [],
  costs: [],
  trip: makeTrip(),
  exchangeRates: [],
});

// ---------------------------------------------------------------------------
// stop/night totals
// ---------------------------------------------------------------------------

describe("stopCount and nightTotal", () => {
  it("returns 0 for empty stops", () => {
    const m = computePlanMetrics(emptyInput());
    expect(m.stopCount).toBe(0);
    expect(m.nightTotal).toBe(0);
  });

  it("sums nights from stops", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      stops: [
        makeStop("a", { nights: 3, sortOrder: 0 }),
        makeStop("b", { nights: 5, sortOrder: 1 }),
      ],
    };
    const m = computePlanMetrics(input);
    expect(m.stopCount).toBe(2);
    expect(m.nightTotal).toBe(8);
  });

  it("treats null nights as 0", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      stops: [
        makeStop("a", { nights: null, sortOrder: 0 }),
        makeStop("b", { nights: 3, sortOrder: 1 }),
      ],
    };
    const m = computePlanMetrics(input);
    expect(m.nightTotal).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// route and countries
// ---------------------------------------------------------------------------

describe("route and countries", () => {
  it("builds route in sortOrder", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      stops: [
        makeStop("b", { name: "Barcelona", country: "Spain", nights: 3, sortOrder: 2 }),
        makeStop("a", { name: "Amsterdam", country: "Netherlands", nights: 2, sortOrder: 1 }),
      ],
    };
    const m = computePlanMetrics(input);
    expect(m.route).toEqual([
      { name: "Amsterdam", country: "Netherlands", nights: 2 },
      { name: "Barcelona", country: "Spain", nights: 3 },
    ]);
  });

  it("returns distinct countries in route order", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      stops: [
        makeStop("a", { country: "France", nights: 2, sortOrder: 0 }),
        makeStop("b", { country: "Spain", nights: 3, sortOrder: 1 }),
        makeStop("c", { country: "France", nights: 1, sortOrder: 2 }),
      ],
    };
    const m = computePlanMetrics(input);
    // Distinct, in order of first appearance
    expect(m.countries).toEqual(["France", "Spain"]);
  });

  it("excludes null countries from countries list", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      stops: [
        makeStop("a", { country: null, nights: 2, sortOrder: 0 }),
        makeStop("b", { country: "Germany", nights: 1, sortOrder: 1 }),
      ],
    };
    const m = computePlanMetrics(input);
    expect(m.countries).toEqual(["Germany"]);
  });
});

// ---------------------------------------------------------------------------
// projectedEnd delegates to computeProjectedEnd
// ---------------------------------------------------------------------------

describe("projectedEnd", () => {
  it("returns null for empty stops with no startDate", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      trip: makeTrip({ startDate: null }),
    };
    const m = computePlanMetrics(input);
    expect(m.projectedEnd).toBeNull();
  });

  it("projects end from startDate + stop nights", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      trip: makeTrip({ startDate: "2026-07-01" }),
      stops: [
        makeStop("a", { nights: 3, sortOrder: 0 }),
        makeStop("b", { nights: 4, sortOrder: 1 }),
      ],
    };
    const m = computePlanMetrics(input);
    // 7 nights from 2026-07-01 → 2026-07-08
    expect(m.projectedEnd).toBe("2026-07-08");
  });
});

// ---------------------------------------------------------------------------
// hardEndState
// ---------------------------------------------------------------------------

describe("hardEndState", () => {
  it("returns 'none' when no hardEndDate", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      trip: makeTrip({ hardEndDate: null }),
    };
    expect(computePlanMetrics(input).hardEndState).toBe("none");
  });

  it("returns 'none' when projectedEnd is null", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      trip: makeTrip({ startDate: null, hardEndDate: "2026-08-01" }),
    };
    expect(computePlanMetrics(input).hardEndState).toBe("none");
  });

  it("returns 'over' when projected end passes the hard end date", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      trip: makeTrip({ startDate: "2026-07-01", hardEndDate: "2026-07-05" }),
      stops: [
        makeStop("a", { nights: 10, sortOrder: 0 }), // projects to 2026-07-11 > 2026-07-05
      ],
    };
    expect(computePlanMetrics(input).hardEndState).toBe("over");
  });

  it("returns 'approaching' when within HARD_END_APPROACHING_NIGHTS (2)", () => {
    // start: 2026-07-01, 4 nights → projectedEnd = 2026-07-05
    // hardEndDate = 2026-07-06 → slack = 1 day → approaching
    const input: PlanMetricsInput = {
      ...emptyInput(),
      trip: makeTrip({ startDate: "2026-07-01", hardEndDate: "2026-07-06" }),
      stops: [makeStop("a", { nights: 4, sortOrder: 0 })],
    };
    expect(computePlanMetrics(input).hardEndState).toBe("approaching");
  });

  it("returns 'ok' when plenty of slack", () => {
    // start: 2026-07-01, 2 nights → projectedEnd 2026-07-03
    // hardEndDate 2026-07-20 → slack 17 → ok
    const input: PlanMetricsInput = {
      ...emptyInput(),
      trip: makeTrip({ startDate: "2026-07-01", hardEndDate: "2026-07-20" }),
      stops: [makeStop("a", { nights: 2, sortOrder: 0 })],
    };
    expect(computePlanMetrics(input).hardEndState).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// flagCounts
// ---------------------------------------------------------------------------

describe("flagCounts", () => {
  it("returns zero counts for clean input", () => {
    const m = computePlanMetrics(emptyInput());
    expect(m.flagCounts.warning).toBe(0);
    expect(m.flagCounts.info).toBe(0);
  });

  it("flags counts split by severity", () => {
    // Scheduled stop without accommodation → warning (rule 1)
    // Short stay (1 night) → info (rule 4)
    const stop = makeStop("a", {
      name: "Paris",
      timezone: "Europe/Paris",
      arriveDate: "2026-07-01",
      departDate: "2026-07-02",
      nights: 1,
      sortOrder: 0,
    });
    const input: PlanMetricsInput = {
      ...emptyInput(),
      trip: makeTrip({ startDate: "2026-07-01" }),
      stops: [stop],
      accommodations: [], // no accommodation → warning
    };
    const m = computePlanMetrics(input);
    // Rule 1: stop without accommodation → warning
    // Rule 4: 1-night stay → info
    expect(m.flagCounts.warning).toBeGreaterThanOrEqual(1);
    expect(m.flagCounts.info).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// flightCount
// ---------------------------------------------------------------------------

describe("flightCount", () => {
  it("counts FLIGHT mode transports", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      transports: [
        makeTransport("t1", { mode: "FLIGHT" }),
        makeTransport("t2", { mode: "FLIGHT" }),
        makeTransport("t3", { mode: "CAR" }),
        makeTransport("t4", { mode: "TRAIN" }),
      ],
    };
    expect(computePlanMetrics(input).flightCount).toBe(2);
  });

  it("returns 0 when no flights", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      transports: [
        makeTransport("t1", { mode: "CAR" }),
      ],
    };
    expect(computePlanMetrics(input).flightCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// transitMinutes
// ---------------------------------------------------------------------------

describe("transitMinutes", () => {
  it("sums dep→arr minutes for transports with both times set", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      transports: [
        // 2026-07-01T08:00Z → 2026-07-01T10:30Z = 150 minutes
        makeTransport("t1", {
          mode: "FLIGHT",
          depAt: "2026-07-01T08:00:00Z",
          arrAt: "2026-07-01T10:30:00Z",
        }),
        // 2026-07-02T09:00Z → 2026-07-02T09:45Z = 45 minutes
        makeTransport("t2", {
          mode: "TRAIN",
          depAt: "2026-07-02T09:00:00Z",
          arrAt: "2026-07-02T09:45:00Z",
        }),
        // missing arrAt → skip
        makeTransport("t3", {
          mode: "FLIGHT",
          depAt: "2026-07-03T10:00:00Z",
          arrAt: null,
        }),
      ],
    };
    const m = computePlanMetrics(input);
    expect(m.transitMinutes).toBe(195);
  });

  it("returns 0 when no timed transports", () => {
    expect(computePlanMetrics(emptyInput()).transitMinutes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// drivingMinutes
// ---------------------------------------------------------------------------

describe("drivingMinutes", () => {
  it("estimates driving time for CAR legs with coords", () => {
    // London (51.507,-0.127) → Paris (48.856, 2.352)
    // haversineKm ≈ 340 km; road km * 1.4 windingFactor ≈ 476; / 80 kph * 60 ≈ 357 min
    const stopA = makeStop("london", {
      lat: 51.507,
      lng: -0.127,
      sortOrder: 0,
      arriveDate: "2026-07-01",
      departDate: "2026-07-03",
    });
    const stopB = makeStop("paris", {
      lat: 48.856,
      lng: 2.352,
      sortOrder: 1,
      arriveDate: "2026-07-03",
      departDate: "2026-07-05",
    });
    const input: PlanMetricsInput = {
      ...emptyInput(),
      stops: [stopA, stopB],
      trip: makeTrip({ drivingWindingFactor: 1.4, drivingAvgSpeedKph: 80 }),
      transports: [
        makeTransport("t1", { mode: "CAR", fromStopId: "london", toStopId: "paris" }),
      ],
    };
    const m = computePlanMetrics(input);
    // Should be > 0 and in the right ballpark
    expect(m.drivingMinutes).toBeGreaterThan(200);
    expect(m.drivingMinutes).toBeLessThan(600);
  });

  it("returns 0 for non-CAR transports or missing coords", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      transports: [
        makeTransport("t1", { mode: "FLIGHT" }),
        makeTransport("t2", { mode: "CAR" }), // no fromStopId/toStopId → no coords
      ],
    };
    expect(computePlanMetrics(input).drivingMinutes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// budgetHomeMinor
// ---------------------------------------------------------------------------

describe("budgetHomeMinor", () => {
  it("sums estimated costs in home currency", () => {
    const input: PlanMetricsInput = {
      ...emptyInput(),
      trip: makeTrip({ homeCurrency: "USD", startDate: "2026-07-01" }),
      stops: [makeStop("a", { sortOrder: 0, arriveDate: "2026-07-01", departDate: "2026-07-03" })],
      costs: [
        makeCost("c1", { estimatedMinor: 5000, currency: "USD", rateToHome: 1, ownerType: "OTHER" }),
        makeCost("c2", { estimatedMinor: 3000, currency: "USD", rateToHome: 1, ownerType: "OTHER" }),
      ],
    };
    const m = computePlanMetrics(input);
    expect(m.budgetHomeMinor).toBe(8000);
  });

  it("returns 0 (not null) for empty costs", () => {
    const m = computePlanMetrics(emptyInput());
    expect(m.budgetHomeMinor).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// diffMetrics
// ---------------------------------------------------------------------------

describe("diffMetrics", () => {
  const base: PlanMetrics = {
    stopCount: 3,
    nightTotal: 10,
    countries: ["France", "Spain"],
    projectedEnd: "2026-07-11",
    hardEndState: "ok",
    budgetHomeMinor: 50000,
    flagCounts: { warning: 1, info: 2 },
    transitMinutes: 120,
    drivingMinutes: 90,
    flightCount: 1,
    route: [],
    legs: [],
  };

  const variant: PlanMetrics = {
    stopCount: 4,
    nightTotal: 14,
    countries: ["France", "Spain", "Portugal"],
    projectedEnd: "2026-07-15",
    hardEndState: "ok",
    budgetHomeMinor: 70000,
    flagCounts: { warning: 0, info: 3 },
    transitMinutes: 180,
    drivingMinutes: 60,
    flightCount: 2,
    route: [],
    legs: [],
  };

  it("computes numeric deltas variant minus base", () => {
    const d = diffMetrics(base, variant);
    expect(d.stopCount).toBe(1);
    expect(d.nightTotal).toBe(4);
    expect(d.budgetHomeMinor).toBe(20000);
    expect(d.flagWarnings).toBe(-1);
    expect(d.flagInfos).toBe(1);
    expect(d.transitMinutes).toBe(60);
    expect(d.drivingMinutes).toBe(-30);
    expect(d.flightCount).toBe(1);
  });

  it("computes projectedEnd day delta", () => {
    const d = diffMetrics(base, variant);
    // 2026-07-15 - 2026-07-11 = 4 days
    expect(d.projectedEndDays).toBe(4);
  });

  it("handles null projectedEnd", () => {
    const variantNullEnd: PlanMetrics = { ...variant, projectedEnd: null };
    const d = diffMetrics(base, variantNullEnd);
    expect(d.projectedEndDays).toBeNull();
  });

  it("handles null budgetHomeMinor", () => {
    const variantNullBudget: PlanMetrics = { ...variant, budgetHomeMinor: null };
    const d = diffMetrics(base, variantNullBudget);
    expect(d.budgetHomeMinor).toBeNull();
  });
});

describe("computePlanMetrics — legs", () => {
  it("emits one leg per transport whose endpoints both resolve, with resolved stop names", () => {
    const metrics = computePlanMetrics({
      stops: [
        { id: "s1", name: "Rome", country: "IT", nights: 3, sortOrder: 0, arriveDate: null, departDate: null, pinned: false, lat: null, lng: null, timezone: "UTC" },
        { id: "s2", name: "Florence", country: "IT", nights: 2, sortOrder: 1, arriveDate: null, departDate: null, pinned: false, lat: null, lng: null, timezone: "UTC" },
      ],
      transports: [
        { id: "t1", mode: "TRAIN", fromStopId: "s1", toStopId: "s2", depAt: null, arrAt: null },
        { id: "t2", mode: "FLIGHT", fromStopId: "s1", toStopId: "nope", depAt: null, arrAt: null },
      ],
      accommodations: [],
      items: [],
      costs: [],
      trip: { startDate: null, hardEndDate: null, homeCurrency: "AUD", drivingWindingFactor: 1.5, drivingAvgSpeedKph: 80 },
      exchangeRates: [],
    });
    expect(metrics.legs).toEqual([{ fromName: "Rome", toName: "Florence", mode: "TRAIN" }]);
  });
});

// Minimal PlanMetrics builder — only route + legs matter to diffRoute.
function pm(
  route: PlanMetrics["route"],
  legs: PlanMetrics["legs"] = [],
): PlanMetrics {
  return {
    stopCount: route.length, nightTotal: 0, countries: [], projectedEnd: null,
    hardEndState: "none", budgetHomeMinor: null, flagCounts: { warning: 0, info: 0 },
    transitMinutes: 0, drivingMinutes: 0, flightCount: 0, route, legs,
  };
}
const R = (name: string, nights: number | null, country: string | null = "IT") => ({ name, country, nights });

describe("diffRoute", () => {
  it("reports an identical route as 'Same route' with all stops 'same'", () => {
    const base = pm([R("Rome", 3), R("Florence", 2)]);
    const d = diffRoute(base, pm([R("Rome", 3), R("Florence", 2)]));
    expect(d.summary).toBe("Same route");
    expect(d.stops.map((s) => s.kind)).toEqual(["same", "same"]);
  });

  it("marks an added stop and lists it in the summary", () => {
    const base = pm([R("Rome", 3), R("Florence", 2)]);
    const d = diffRoute(base, pm([R("Rome", 3), R("Lucerne", 3, "CH"), R("Florence", 2)]));
    const lucerne = d.stops.find((s) => s.name === "Lucerne");
    expect(lucerne?.kind).toBe("added");
    // interleaved at its variant position (between Rome and Florence)
    expect(d.stops.map((s) => s.name)).toEqual(["Rome", "Lucerne", "Florence"]);
    expect(d.summary).toBe("+Lucerne");
  });

  it("marks a dropped stop as a ghost at its real-plan position", () => {
    const base = pm([R("Rome", 3), R("Venice", 3), R("Florence", 2)]);
    const d = diffRoute(base, pm([R("Rome", 3), R("Florence", 2)]));
    const venice = d.stops.find((s) => s.name === "Venice");
    expect(venice?.kind).toBe("dropped");
    expect(d.stops.map((s) => s.name)).toEqual(["Rome", "Venice", "Florence"]);
    expect(d.summary).toBe("-Venice");
  });

  it("marks a re-nighted stop with base + new nights", () => {
    const base = pm([R("Rome", 4)]);
    const d = diffRoute(base, pm([R("Rome", 2)]));
    expect(d.stops[0]).toMatchObject({ name: "Rome", kind: "renighted", nights: 2, baseNights: 4 });
    expect(d.summary).toBe("Rome 4→2n");
  });

  it("detects a reordered common stop as 'moved', not drop+add", () => {
    const base = pm([R("A", 1), R("B", 1), R("C", 1)]);
    const d = diffRoute(base, pm([R("A", 1), R("C", 1), R("B", 1)]));
    const kinds = new Set(d.stops.map((s) => s.kind));
    expect(kinds.has("moved")).toBe(true);
    expect(kinds.has("dropped")).toBe(false);
    expect(kinds.has("added")).toBe(false);
    expect(d.summary).toBe("Reordered");
  });

  it("matches stops case-insensitively by name+country", () => {
    const base = pm([R("Rome", 3)]);
    const d = diffRoute(base, pm([R("rome", 3)]));
    expect(d.stops[0].kind).toBe("same");
  });

  it("reports a transport-mode change between two common stops", () => {
    const base = pm([R("Rome", 3), R("Florence", 2)], [{ fromName: "Rome", toName: "Florence", mode: "TRAIN" }]);
    const variant = pm([R("Rome", 3), R("Florence", 2)], [{ fromName: "Rome", toName: "Florence", mode: "FLIGHT" }]);
    const d = diffRoute(base, variant);
    expect(d.legChanges).toEqual([{ fromName: "Rome", toName: "Florence", fromMode: "TRAIN", toMode: "FLIGHT" }]);
    expect(d.summary).toBe("Transport changed");
  });

  it("combines added + dropped + renighted in the summary, in that order", () => {
    const base = pm([R("Rome", 4), R("Venice", 3)]);
    const variant = pm([R("Rome", 2), R("Lucerne", 3, "CH")]);
    const d = diffRoute(base, variant);
    expect(d.summary).toBe("+Lucerne · -Venice · Rome 4→2n");
  });
});
