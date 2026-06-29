import { describe, expect, it } from "vitest";
import { flowDates, type FlowStop, computeProjectedEnd } from "./firm-up";

const rough = (id: string, nights: number | null): FlowStop => ({
  id, nights, pinned: false, arriveDate: null, departDate: null,
});
const pinned = (id: string, arriveDate: string, departDate: string): FlowStop => ({
  id, nights: null, pinned: true, arriveDate, departDate,
});

describe("flowDates", () => {
  it("flows nights forward from the anchor with same-day handoff", () => {
    const { results, conflicts } = flowDates(
      [rough("a", 3), rough("b", 2), rough("c", 2)],
      "2026-07-03",
    );
    expect(conflicts).toEqual([]);
    expect(results).toEqual([
      { id: "a", arriveDate: "2026-07-03", departDate: "2026-07-06", pinned: false, changed: true },
      { id: "b", arriveDate: "2026-07-06", departDate: "2026-07-08", pinned: false, changed: true },
      { id: "c", arriveDate: "2026-07-08", departDate: "2026-07-10", pinned: false, changed: true },
    ]);
  });

  it("defaults a null nights count to 1", () => {
    const { results } = flowDates([rough("a", null)], "2026-07-03");
    expect(results[0]).toMatchObject({ arriveDate: "2026-07-03", departDate: "2026-07-04" });
  });

  it("treats a pinned stop as an immovable boundary and resumes after it", () => {
    const { results, conflicts } = flowDates(
      [rough("a", 2), pinned("p", "2026-07-10", "2026-07-13"), rough("b", 1)],
      "2026-07-03",
    );
    expect(conflicts).toEqual([]);
    expect(results[0]).toMatchObject({ id: "a", arriveDate: "2026-07-03", departDate: "2026-07-05" });
    expect(results[1]).toMatchObject({ id: "p", arriveDate: "2026-07-10", departDate: "2026-07-13", changed: false });
    expect(results[2]).toMatchObject({ id: "b", arriveDate: "2026-07-13", departDate: "2026-07-14" });
  });

  it("flags a conflict when flexible stops can't fit before a pin, but keeps the pin", () => {
    const { results, conflicts } = flowDates(
      [rough("a", 9), pinned("p", "2026-07-05", "2026-07-08")],
      "2026-07-03",
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].stopId).toBe("p");
    expect(results[1]).toMatchObject({ arriveDate: "2026-07-05", departDate: "2026-07-08", changed: false });
  });

  it("marks changed=false when a stop's recomputed dates equal its current dates", () => {
    const s: FlowStop = { id: "a", nights: 3, pinned: false, arriveDate: "2026-07-03", departDate: "2026-07-06" };
    const { results } = flowDates([s], "2026-07-03");
    expect(results[0].changed).toBe(false);
  });

  it("returns empty for empty input", () => {
    expect(flowDates([], "2026-07-03")).toEqual({ results: [], conflicts: [] });
  });
});

describe("computeProjectedEnd", () => {
  const stop = (over: Partial<{ id: string; arriveDate: string | null; departDate: string | null; nights: number | null; pinned: boolean; sortOrder: number }>) => ({
    id: "s", arriveDate: null, departDate: null, nights: null, pinned: false, sortOrder: 0, ...over,
  });

  it("returns null for no stops", () => {
    expect(computeProjectedEnd([], "2026-07-01")).toBeNull();
  });

  it("returns null when there is no anchor and no scheduled stop", () => {
    expect(computeProjectedEnd([stop({ id: "a", nights: 3 })], null)).toBeNull();
  });

  it("flows rough nights forward from the start anchor", () => {
    const stops = [
      stop({ id: "a", nights: 3, sortOrder: 0 }),
      stop({ id: "b", nights: 4, sortOrder: 1 }),
    ];
    expect(computeProjectedEnd(stops, "2026-07-01")).toBe("2026-07-08");
  });

  it("uses scheduled stops' real dates and flows a rough tail after them", () => {
    const stops = [
      stop({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }),
      stop({ id: "b", nights: 2, sortOrder: 1 }),
    ];
    expect(computeProjectedEnd(stops, "2026-07-01")).toBe("2026-07-07");
  });

  it("equals the last scheduled depart when nothing is rough", () => {
    const stops = [
      stop({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }),
      stop({ id: "b", arriveDate: "2026-07-05", departDate: "2026-07-09", sortOrder: 1 }),
    ];
    expect(computeProjectedEnd(stops, "2026-07-01")).toBe("2026-07-09");
  });

  it("falls back to the earliest scheduled arrive when no start anchor is given", () => {
    const stops = [stop({ id: "a", arriveDate: "2026-08-10", departDate: "2026-08-14", sortOrder: 0 })];
    expect(computeProjectedEnd(stops, null)).toBe("2026-08-14");
  });

  it("flows a rough stop sandwiched between two scheduled stops, ending at the last scheduled depart", () => {
    const stops = [
      stop({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }),
      stop({ id: "b", nights: 2, sortOrder: 1 }), // rough, fits in the gap
      stop({ id: "c", arriveDate: "2026-07-10", departDate: "2026-07-14", sortOrder: 2 }),
    ];
    expect(computeProjectedEnd(stops, "2026-07-01")).toBe("2026-07-14");
  });

  it("does not rewind when the provided anchor is later than a scheduled stop", () => {
    const stops = [
      stop({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }),
      stop({ id: "b", nights: 3, sortOrder: 1 }),
    ];
    // Anchor 07-03 is after stop a's arrive; projection must still flow b from
    // a's real depart (07-05) -> 07-08, not from a rewound cursor.
    expect(computeProjectedEnd(stops, "2026-07-03")).toBe("2026-07-08");
  });
});
