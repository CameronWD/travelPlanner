import { describe, it, expect } from "vitest";
import { computeProjection } from "./trip-projection";

const trip = { startDate: "2026-07-01", hardEndDate: "2026-07-20", roundTrip: true };
const paris = { id: "a", arriveDate: "2026-07-01", departDate: "2026-07-04", nights: 3, pinned: false, sortOrder: 0, timezone: "Europe/Paris" };
const rough = { id: "b", arriveDate: null, departDate: null, nights: 2, pinned: false, sortOrder: 1, timezone: null };

describe("computeProjection (spec 2026-10-06 §C)", () => {
  it("flows rough nights on from the scheduled Stops and carries the hard end date", () => {
    expect(computeProjection({ trip, stops: [paris, rough], transports: [] })).toEqual({
      projectedEnd: "2026-07-06",
      hardEndDate: "2026-07-20",
      deadline: { kind: "hard-end", date: "2026-07-20" },
    });
  });
  it("a dated leg leaving the last Stop is the deadline, in that Stop's zone", () => {
    const leg = { mode: "FLIGHT", fromStopId: "a", toStopId: null, depAt: new Date("2026-07-04T08:00:00Z"), arrIsHome: true };
    expect(computeProjection({ trip: { ...trip, roundTrip: false }, stops: [paris], transports: [leg] }).deadline).toEqual({
      kind: "return-leg", date: "2026-07-04", mode: "FLIGHT", homeward: false,
    });
  });
  it("is all nulls for a missing Trip", () => {
    expect(computeProjection({ trip: null, stops: [], transports: [] })).toEqual({ projectedEnd: null, hardEndDate: null, deadline: null });
  });
});
