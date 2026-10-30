import { describe, expect, it } from "vitest";
import { parseRefreshArgs, refreshOrder } from "./travel-times-order";

describe("refreshOrder", () => {
  it("puts upcoming, current and undated Trips first, finished Trips last, otherwise keeping the order given", () => {
    const trips = [
      { id: "done", endDate: "2026-09-01" },
      { id: "idea", endDate: null },
      { id: "now", endDate: "2026-10-30" },
      { id: "older", endDate: "2025-01-01" },
      { id: "next", endDate: "2027-03-01" },
    ];
    expect(refreshOrder(trips, "2026-10-30").map((t) => t.id)).toEqual(["idea", "now", "next", "done", "older"]);
  });
});

describe("parseRefreshArgs", () => {
  it("defaults to a dry run", () => {
    expect(parseRefreshArgs([])).toEqual({ execute: false });
    expect(parseRefreshArgs(["--execute"])).toEqual({ execute: true });
  });
  it("takes a positive whole --cap with --execute", () => {
    expect(parseRefreshArgs(["--execute", "--cap", "500"])).toEqual({ execute: true, cap: 500 });
  });
  it("rejects --cap without --execute, without a value, or with a bad value", () => {
    for (const args of [["--cap", "500"], ["--execute", "--cap"], ["--execute", "--cap", "0"], ["--execute", "--cap", "abc"], ["--execute", "--cap", "1.5"], ["--execute", "--cap", "-3"]]) {
      expect(parseRefreshArgs(args)).toHaveProperty("error");
    }
  });
});
