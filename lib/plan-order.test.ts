import { describe, expect, it } from "vitest";
import { orderPlanStops } from "./plan-order";

const stop = (id: string, sortOrder: number, arriveDate: string | null, departDate: string | null) =>
  ({ id, sortOrder, arriveDate, departDate });

describe("orderPlanStops", () => {
  it("re-slots scheduled stops into date order while rough stops keep their slots", () => {
    // Arrangement: A(dated late), rough R, B(dated early)
    const input = [
      stop("A", 0, "2026-06-10", "2026-06-12"),
      stop("R", 1, null, null),
      stop("B", 2, "2026-06-01", "2026-06-03"),
    ];
    expect(orderPlanStops(input).map((s) => s.id)).toEqual(["B", "R", "A"]);
  });

  it("is identity when scheduled stops are already chronological", () => {
    const input = [
      stop("A", 0, "2026-06-01", "2026-06-03"),
      stop("R", 1, null, null),
      stop("B", 2, "2026-06-03", "2026-06-05"),
    ];
    expect(orderPlanStops(input).map((s) => s.id)).toEqual(["A", "R", "B"]);
  });

  it("breaks arrive-date ties by departDate, then sortOrder, then id", () => {
    const input = [
      stop("long", 0, "2026-06-01", "2026-06-05"),
      stop("short", 1, "2026-06-01", "2026-06-02"),
    ];
    expect(orderPlanStops(input).map((s) => s.id)).toEqual(["short", "long"]);
  });

  it("handles all-rough and empty lists", () => {
    expect(orderPlanStops([])).toEqual([]);
    const rough = [stop("R1", 0, null, null), stop("R2", 1, null, null)];
    expect(orderPlanStops(rough).map((s) => s.id)).toEqual(["R1", "R2"]);
  });
});
