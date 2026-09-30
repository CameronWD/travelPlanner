import { describe, it, expect } from "vitest";
import { exactStopPlacement, storedAnchorFor } from "./exact-stop-placement";
import { insertionOrder } from "@/lib/reorder";
import { orderPlanStops } from "@/lib/plan-order";

/** What the plan looks like after createStop's insert path (insertionOrder) and the canonical re-order. */
function afterServerInsert(plan: ReturnType<typeof s>[], afterId: string | null, arrive: string, depart: string): string[] {
  const { sortOrder, renumber } = insertionOrder(plan, afterId);
  const bumped = plan.map((p) => ({ ...p, sortOrder: renumber.find((r) => r.id === p.id)?.sortOrder ?? p.sortOrder }));
  const all = [...bumped, { id: "new", sortOrder, arriveDate: arrive, departDate: depart }].sort((a, b) => a.sortOrder - b.sortOrder);
  return orderPlanStops(all).map((p) => p.id);
}

const s = (id: string, sortOrder: number, arriveDate: string | null = null, departDate: string | null = null) => ({ id, sortOrder, arriveDate, departDate });
// Display (plan) order: Paris (scheduled), X (rough), Rome (scheduled).
const PLAN = [s("par", 0, "2026-12-10", "2026-12-15"), s("x", 1), s("rom", 2, "2026-12-15", "2026-12-22")];

describe("exactStopPlacement (a scheduled Stop's position is its dates)", () => {
  it("dated after Rome: inserts after Rome, and the rough stop stays between Paris and Rome", () => {
    expect(exactStopPlacement(PLAN, "2026-12-22", "2026-12-24")).toEqual({ afterId: "rom", precedingId: "rom" });
    expect(afterServerInsert(PLAN, "rom", "2026-12-22", "2026-12-24")).toEqual(["par", "x", "rom", "new"]);
    // The old free "after Paris" choice dragged the rough stop past Rome.
    expect(afterServerInsert(PLAN, "par", "2026-12-22", "2026-12-24")).toEqual(["par", "rom", "x", "new"]);
  });

  it("dated between Paris and Rome: inserts right after Paris", () => {
    expect(exactStopPlacement(PLAN, "2026-12-12", "2026-12-14")).toEqual({ afterId: "par", precedingId: "par" });
    expect(afterServerInsert(PLAN, "par", "2026-12-12", "2026-12-14")).toEqual(["par", "new", "x", "rom"]);
  });

  it("dated before every scheduled stop: goes first without moving the rough stop past Paris", () => {
    // Inserted after Paris's slot; date order re-deals it into Paris's slot, Paris just after it.
    expect(exactStopPlacement(PLAN, "2026-12-01", "2026-12-05")).toEqual({ afterId: "par", precedingId: null });
    expect(afterServerInsert(PLAN, "par", "2026-12-01", "2026-12-05")).toEqual(["new", "par", "x", "rom"]);
  });

  it("a rough stop ahead of the first scheduled stop stays ahead", () => {
    const plan = [s("x", 0), s("par", 1, "2026-12-10", "2026-12-15")];
    expect(exactStopPlacement(plan, "2026-12-01", "2026-12-05")).toEqual({ afterId: "par", precedingId: "x" });
  });

  it("no scheduled stops: appends after the last stop", () => {
    const plan = [s("x", 0), s("y", 1)];
    expect(exactStopPlacement(plan, "2026-12-01", "2026-12-05")).toEqual({ afterId: null, precedingId: "y" });
  });

  it("an empty plan goes first", () => {
    expect(exactStopPlacement([], "2026-12-01", "2026-12-05")).toEqual({ afterId: null, precedingId: null });
  });

  describe("stored sortOrder out of date order (old appends, re-dated stops)", () => {
    // Stored [rom(0), x(1, rough), par(2)] displays as [par, x, rom].
    const STORED = [s("rom", 0, "2026-12-15", "2026-12-22"), s("x", 1), s("par", 2, "2026-12-10", "2026-12-15")];
    const DISPLAYED = orderPlanStops(STORED);

    it.each([["plan", DISPLAYED], ["stored", STORED]] as const)("accepts the stops in %s order", (_, input) => {
      expect(exactStopPlacement(input, "2026-12-22", "2026-12-24")).toEqual({ afterId: "par", precedingId: "rom" });
    });

    it("22–24 Dec: goes after Rome and x stays between Paris and Rome", () => {
      const p = exactStopPlacement(DISPLAYED, "2026-12-22", "2026-12-24");
      expect(p.precedingId).toBe("rom");
      const result = afterServerInsert(STORED, p.afterId, "2026-12-22", "2026-12-24");
      expect(result).toEqual(["par", "x", "rom", "new"]);
      expect(result[result.indexOf("new") - 1]).toBe(p.precedingId);
    });

    it("11–12 Dec: goes after Paris, and the label names the real neighbour", () => {
      const p = exactStopPlacement(DISPLAYED, "2026-12-11", "2026-12-12");
      expect(p).toEqual({ afterId: "rom", precedingId: "par" });
      const result = afterServerInsert(STORED, p.afterId, "2026-12-11", "2026-12-12");
      expect(result).toEqual(["par", "new", "x", "rom"]);
      expect(result[result.indexOf("new") - 1]).toBe(p.precedingId);
    });

    it("storedAnchorFor: a rough stop chosen after Rome in the plan lands after Rome", () => {
      const afterId = storedAnchorFor(DISPLAYED, "rom");
      expect(afterId).toBe("par");
      const { sortOrder, renumber } = insertionOrder(STORED, afterId);
      const bumped = STORED.map((p) => ({ ...p, sortOrder: renumber.find((r) => r.id === p.id)?.sortOrder ?? p.sortOrder }));
      const all = [...bumped, s("new", sortOrder)].sort((a, b) => a.sortOrder - b.sortOrder);
      expect(orderPlanStops(all).map((p) => p.id)).toEqual(["par", "x", "rom", "new"]);
      expect(storedAnchorFor(DISPLAYED, "par")).toBe("rom");
      expect(storedAnchorFor(DISPLAYED, "x")).toBe("x");
      expect(storedAnchorFor(DISPLAYED, null)).toBeNull();
    });
  });
});
