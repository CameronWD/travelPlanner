import { describe, it, expect } from "vitest";
import { defaultOpenStops, parsePlanHash, serializePlanHash } from "./plan-hash";

describe("parsePlanHash", () => {
  it("reads the open set and the day", () => {
    expect(parsePlanHash("#open=a,b&day=2026-12-11")).toEqual({ open: ["a", "b"], day: "2026-12-11", stopTarget: null });
  });
  it("a #stop- hash wins: it opens that stop and targets it", () => {
    expect(parsePlanHash("#stop-s2")).toEqual({ open: ["s2"], day: null, stopTarget: "s2" });
  });
  it("drops a bad day, empty ids and duplicates; tolerates no leading #", () => {
    expect(parsePlanHash("open=a,,a&day=11-12")).toEqual({ open: ["a"], day: null, stopTarget: null });
  });
  it("anything else is empty", () => {
    expect(parsePlanHash("")).toEqual({ open: [], day: null, stopTarget: null });
    expect(parsePlanHash("#travellers")).toEqual({ open: [], day: null, stopTarget: null });
  });
});

describe("serializePlanHash", () => {
  it("round-trips and omits empty parts", () => {
    expect(serializePlanHash({ open: ["a", "b"], day: "2026-12-11" })).toBe("open=a,b&day=2026-12-11");
    expect(serializePlanHash({ open: ["a"], day: null })).toBe("open=a");
    expect(serializePlanHash({ open: [], day: null })).toBe("");
    expect(parsePlanHash(`#${serializePlanHash({ open: ["x"], day: "2026-01-02" })}`).open).toEqual(["x"]);
  });
});

describe("defaultOpenStops (PLAN.md §3 fold state)", () => {
  const STOPS = [
    { id: "lon", arriveDate: "2026-12-05", departDate: "2026-12-10" },
    { id: "par", arriveDate: "2026-12-10", departDate: "2026-12-15" },
    { id: "mun", arriveDate: null, departDate: null },
  ];
  it("the current stop when travelling (the arriving one on a changeover day)", () => {
    expect(defaultOpenStops(STOPS, {}, "2026-12-12")).toEqual(["par"]);
    expect(defaultOpenStops(STOPS, {}, "2026-12-10")).toEqual(["par"]);
  });
  it("else the first stop with any plans, else none", () => {
    expect(defaultOpenStops(STOPS, { par: 3 }, "2026-01-01")).toEqual(["par"]);
    expect(defaultOpenStops(STOPS, {}, "2026-01-01")).toEqual([]);
  });
});
