import { describe, it, expect } from "vitest";
import {
  toFlagStop,
  toProjectionStop,
  planFlagInput,
  demoLegAnchorKeys,
  type DemoStop,
  type DemoPlan,
  type DemoTransport,
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

describe("demoLegAnchorKeys (spec 2026-10-04 §D)", () => {
  it("gives each leg the stop key of the slot it resolves to in plan order; the head is null", () => {
    // sortOrder: Paris, Lucerne (rough), Rome — but Rome's dates come first,
    // so plan order is Rome, Lucerne, Paris (ADR 0038).
    const rome: DemoStop = { key: "s3", name: "Rome", arriveDate: "2026-12-20", departDate: "2026-12-24", sortOrder: 2 };
    const leg = (key: string, o: Partial<DemoTransport>): DemoTransport => ({ key, mode: "TRAIN", sortOrder: 0, ...o });
    const keys = demoLegAnchorKeys({
      stops: [scheduled, rough, rome],
      transports: [
        leg("t1", { fromStopKey: "s1" }),                        // leaves Paris
        leg("t2", { depPlace: "Zürich", toStopKey: "s1" }),      // arrives at Paris → after Lucerne
        leg("t3", { depIsHome: true, toStopKey: "s3" }),         // arrives at the first Stop → head
        leg("t4", { depPlace: "A", arrPlace: "B" }),             // no Stop at all → head
      ],
    });
    expect([...keys]).toEqual([["t1", "s1"], ["t2", "s2"], ["t3", null], ["t4", null]]);
  });
});
