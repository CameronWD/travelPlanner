import { describe, it, expect } from "vitest";
import { nightsOver, simulateAfterTrims, type FitStop } from "./make-it-fit";

const s = (over: Partial<FitStop>): FitStop => ({
  id: "s", name: "Stop", arriveDate: null, departDate: null, nights: null, pinned: false, sortOrder: 0, ...over,
});

describe("nightsOver", () => {
  it("is 0 when on or under the hard end date", () => {
    expect(nightsOver("2026-07-10", "2026-07-10")).toBe(0);
    expect(nightsOver("2026-07-08", "2026-07-10")).toBe(0);
    expect(nightsOver(null, "2026-07-10")).toBe(0);
    expect(nightsOver("2026-07-10", null)).toBe(0);
  });
  it("counts nights past the hard end date", () => {
    expect(nightsOver("2026-07-17", "2026-07-15")).toBe(2);
  });
});

describe("simulateAfterTrims", () => {
  const anchor = "2026-07-01";

  it("reduces a rough stop's nights and pulls the projected end in", () => {
    const stops = [s({ id: "a", nights: 4, sortOrder: 0 }), s({ id: "b", nights: 4, sortOrder: 1 })];
    expect(simulateAfterTrims(stops, anchor, [{ id: "a", nights: 2 }]).projectedEnd).toBe("2026-07-07");
  });

  it("trimming a scheduled stop re-derives its depart and ripples the following dated run", () => {
    const stops = [
      s({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }),
      s({ id: "b", arriveDate: "2026-07-05", departDate: "2026-07-09", sortOrder: 1 }),
    ];
    const r = simulateAfterTrims(stops, anchor, [{ id: "a", nights: 2 }]);
    expect(r.projectedEnd).toBe("2026-07-07");
    expect(r.byId["b"].arriveDate).toBe("2026-07-03");
    expect(r.byId["b"].departDate).toBe("2026-07-07");
  });

  it("a pinned stop blocks the ripple and is never moved", () => {
    const stops = [
      s({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }),
      s({ id: "p", arriveDate: "2026-07-10", departDate: "2026-07-12", pinned: true, sortOrder: 1 }),
    ];
    const r = simulateAfterTrims(stops, anchor, [{ id: "a", nights: 2 }]);
    expect(r.byId["p"].arriveDate).toBe("2026-07-10");
    expect(r.projectedEnd).toBe("2026-07-12");
  });

  it("a rough stop breaks the contiguous dated run (ripple stops there)", () => {
    const stops = [
      s({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }),
      s({ id: "r", nights: 2, sortOrder: 1 }),
      s({ id: "c", arriveDate: "2026-07-20", departDate: "2026-07-22", sortOrder: 2 }),
    ];
    const r = simulateAfterTrims(stops, anchor, [{ id: "a", nights: 2 }]);
    expect(r.byId["c"].arriveDate).toBe("2026-07-20");
  });

  it("applies simultaneous trims to two scheduled stops, cascading the ripple", () => {
    const stops = [
      s({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }), // 4n
      s({ id: "b", arriveDate: "2026-07-05", departDate: "2026-07-09", sortOrder: 1 }), // 4n, contiguous
    ];
    const r = simulateAfterTrims(stops, anchor, [{ id: "a", nights: 2 }, { id: "b", nights: 2 }]);
    // a -> 07-01..07-03; a's ripple pulls b to 07-03..07-07; then b trimmed to 2 -> 07-03..07-05
    expect(r.byId["a"].departDate).toBe("2026-07-03");
    expect(r.byId["b"].arriveDate).toBe("2026-07-03");
    expect(r.byId["b"].departDate).toBe("2026-07-05");
    expect(r.projectedEnd).toBe("2026-07-05");
  });

  it("a no-op trim (to current nights) leaves dates unchanged", () => {
    const stops = [s({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 })];
    const r = simulateAfterTrims(stops, anchor, [{ id: "a", nights: 4 }]);
    expect(r.byId["a"].departDate).toBe("2026-07-05");
    expect(r.projectedEnd).toBe("2026-07-05");
  });
});
