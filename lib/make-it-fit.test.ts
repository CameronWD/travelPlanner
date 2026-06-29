import { describe, it, expect } from "vitest";
import { nightsOver, simulateAfterTrims, buildTrimPlan, buildDropCandidates, type FitStop } from "./make-it-fit";

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

describe("buildTrimPlan", () => {
  const anchor = "2026-07-01";

  it("returns an empty, fitting plan when not over", () => {
    const stops = [s({ id: "a", nights: 3, sortOrder: 0 })];
    const plan = buildTrimPlan(stops, anchor, "2026-07-10");
    expect(plan.items).toEqual([]);
    expect(plan.fits).toBe(true);
  });

  it("trims proportionally across flexible stops to land on the date", () => {
    const stops = [
      s({ id: "a", name: "Rome", nights: 6, sortOrder: 0 }),
      s({ id: "b", name: "Florence", nights: 4, sortOrder: 1 }),
    ];
    const plan = buildTrimPlan(stops, anchor, "2026-07-07"); // 10n -> ends 07-11; 4 over
    expect(plan.fits).toBe(true);
    expect(plan.resultingEnd! <= "2026-07-07").toBe(true);
    const trimmed = plan.items.reduce((sum, it) => sum + (it.fromNights - it.toNights), 0);
    expect(trimmed).toBe(4);
    const rome = plan.items.find((i) => i.id === "a")!;
    const flo = plan.items.find((i) => i.id === "b")!;
    expect(rome.fromNights - rome.toNights).toBeGreaterThanOrEqual(flo.fromNights - flo.toNights);
  });

  it("never trims below the floor of 1 night and reports shortBy when it can't fit", () => {
    const stops = [
      s({ id: "a", nights: 1, sortOrder: 0 }),
      s({ id: "p", name: "Booked", arriveDate: "2026-07-20", departDate: "2026-07-25", pinned: true, sortOrder: 1 }),
    ];
    const plan = buildTrimPlan(stops, anchor, "2026-07-10");
    expect(plan.fits).toBe(false);
    expect(plan.shortBy).toBeGreaterThan(0);
    for (const it of plan.items) expect(it.toNights).toBeGreaterThanOrEqual(1);
  });

  it("ignores pinned stops when trimming", () => {
    const stops = [
      s({ id: "a", name: "Rome", nights: 8, sortOrder: 0 }),
      s({ id: "p", name: "Pin", arriveDate: "2026-07-02", departDate: "2026-07-04", pinned: true, sortOrder: 1 }),
    ];
    const plan = buildTrimPlan(stops, anchor, "2026-07-06");
    expect(plan.items.every((i) => i.id !== "p")).toBe(true);
  });

  it("trims a single flexible stop to land exactly on the date", () => {
    const stops = [s({ id: "a", name: "Rome", nights: 4, sortOrder: 0 })]; // ends 07-05; hard end 07-03 => 2 over
    const plan = buildTrimPlan(stops, anchor, "2026-07-03");
    expect(plan.fits).toBe(true);
    expect(plan.resultingEnd).toBe("2026-07-03");
    expect(plan.items).toEqual([{ id: "a", name: "Rome", fromNights: 4, toNights: 2 }]);
  });

  it("lands the projected end on the hard end date when trimming is sufficient", () => {
    const stops = [
      s({ id: "a", name: "Rome", nights: 6, sortOrder: 0 }),
      s({ id: "b", name: "Florence", nights: 4, sortOrder: 1 }),
    ];
    const plan = buildTrimPlan(stops, anchor, "2026-07-07");
    expect(plan.resultingEnd).toBe("2026-07-07");
  });
});

describe("buildDropCandidates", () => {
  const anchor = "2026-07-01";

  it("lists flexible stops with the resulting end after dropping each, marking one recommended", () => {
    const stops = [
      s({ id: "a", name: "Rome", nights: 4, sortOrder: 0 }),
      s({ id: "b", name: "Pisa", nights: 4, sortOrder: 1 }),
    ];
    const cands = buildDropCandidates(stops, anchor, "2026-07-05");
    expect(cands.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(cands.every((c) => c.fits)).toBe(true);
    expect(cands.filter((c) => c.recommended)).toHaveLength(1);
  });

  it("excludes pinned stops from drop candidates", () => {
    const stops = [
      s({ id: "a", name: "Rome", nights: 4, sortOrder: 0 }),
      s({ id: "p", name: "Booked", arriveDate: "2026-07-05", departDate: "2026-07-09", pinned: true, sortOrder: 1 }),
    ];
    const cands = buildDropCandidates(stops, anchor, "2026-07-06");
    expect(cands.every((c) => c.id !== "p")).toBe(true);
  });

  it("marks no candidate as fitting when even a single drop can't reach the date, but still recommends one", () => {
    const stops = [
      s({ id: "a", name: "Rome", nights: 10, sortOrder: 0 }),
      s({ id: "b", name: "Pisa", nights: 10, sortOrder: 1 }),
    ];
    // ends 07-21; hard end 07-05. Dropping either leaves one 10n stop -> ends 07-11, still over.
    const cands = buildDropCandidates(stops, anchor, "2026-07-05");
    expect(cands.every((c) => !c.fits)).toBe(true);
    expect(cands.filter((c) => c.recommended)).toHaveLength(1);
  });
});
