import { describe, it, expect } from "vitest";
import {
  toFlagStop,
  toProjectionStop,
  planFlagInput,
  type DemoStop,
  type DemoPlan,
} from "./types";

const scheduled: DemoStop = {
  key: "s1", name: "Paris", country: "France", countryCode: "fr",
  lat: 48.85, lng: 2.35, timezone: "Europe/Paris",
  arriveDate: "2026-12-29", departDate: "2027-01-03", sortOrder: 0,
};
const rough: DemoStop = { key: "s2", name: "Lucerne", countryCode: "ch", nights: 3, sortOrder: 1 };

describe("demo adapters", () => {
  it("maps a scheduled stop to a FlagStop", () => {
    expect(toFlagStop(scheduled)).toMatchObject({ id: "s1", arriveDate: "2026-12-29", timezone: "Europe/Paris" });
  });
  it("excludes rough stops from FlagStop (returns null)", () => {
    expect(toFlagStop(rough)).toBeNull();
  });
  it("maps any stop to a ProjectionStop (rough included)", () => {
    expect(toProjectionStop(rough)).toEqual({ id: "s2", arriveDate: null, departDate: null, nights: 3, pinned: false, sortOrder: 1 });
  });
  it("planFlagInput assembles a DetectFlagsInput with only scheduled stops", () => {
    const plan: DemoPlan = { stops: [scheduled, rough], chapters: [], transports: [], accommodations: [], items: [], costs: [] };
    const input = planFlagInput(plan, { tripStart: "2026-12-29", tripEnd: "2027-01-03" });
    expect(input.stops).toHaveLength(1);
    expect(input.stops[0].id).toBe("s1");
    expect(input.roughStopCount).toBe(1);
  });
});
