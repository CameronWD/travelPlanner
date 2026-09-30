import { describe, it, expect } from "vitest";
import type { ProjectionStop } from "@/lib/firm-up";
import type { PlanSummary } from "@/lib/plan-overview";
import {
  addStopConsequence, fitTileModel, formatStayRange, planHeaderMeta, routeCentroid, stayStatus, tripEyebrow,
} from "./plan-model";

const ROME = { arriveDate: "2026-12-15", departDate: "2026-12-20" }; // 5 nights

describe("stayStatus (PLAN.md §3 stay chip, §4.1)", () => {
  it("covered, with the first place, extras and check-in time", () => {
    expect(
      stayStatus(ROME, [
        { name: "Hotel Artemide", checkIn: "2026-12-15", checkOut: "2026-12-20", checkInTime: "15:00" },
        { name: "Spare", checkIn: "2026-12-15", checkOut: "2026-12-16" },
      ]),
    ).toEqual({ kind: "covered", name: "Hotel Artemide", totalNights: 5, coveredNights: 5, extra: 1, checkInTime: "15:00" });
  });
  it("partial and none", () => {
    expect(stayStatus(ROME, [{ name: "A", checkIn: "2026-12-15", checkOut: "2026-12-18" }])).toMatchObject({ kind: "partial", coveredNights: 3, totalNights: 5 });
    expect(stayStatus(ROME, [])).toMatchObject({ kind: "none", name: null, totalNights: 5, coveredNights: 0 });
  });
  it("null for a rough or same-day stop", () => {
    expect(stayStatus({ arriveDate: null, departDate: null }, [])).toBeNull();
    expect(stayStatus({ arriveDate: "2026-12-15", departDate: "2026-12-15" }, [])).toBeNull();
  });
});

describe("formatStayRange", () => {
  it("same month collapses the month; across months keeps both", () => {
    expect(formatStayRange("2026-12-15", "2026-12-22")).toBe("Tue 15 – Tue 22 Dec");
    expect(formatStayRange("2026-12-27", "2027-01-03")).toBe("Sun 27 Dec – Sun 3 Jan");
  });
});

describe("tripEyebrow / planHeaderMeta (PLAN.md §1.1)", () => {
  it("adds the start year unless the name already ends with it", () => {
    expect(tripEyebrow("Christmas in Europe", "2026-12-04")).toBe("Christmas in Europe 2026");
    expect(tripEyebrow("Europe 2026", "2026-12-04")).toBe("Europe 2026");
    expect(tripEyebrow("Someday", null)).toBe("Someday");
  });
  it("stops · rough · range, dropping empty parts", () => {
    expect(planHeaderMeta({ stopCount: 6, roughCount: 1 }, "2026-12-04", "2027-01-08")).toBe("6 stops · 1 rough · Fri 4 Dec – Fri 8 Jan");
    expect(planHeaderMeta({ stopCount: 1, roughCount: 0 }, null, null)).toBe("1 stop");
  });
});

describe("addStopConsequence (PLAN.md §7.4 live line)", () => {
  // A (scheduled, Dec 15-22) → new stop (goes after A) → B (rough, 12 nights),
  // hard end Jan 8. B is rough/flexible, so a stop inserted after A shifts the
  // whole tail exactly like the old flat model assumed — these are the
  // "append after the last real leg" cases, now derived from flowDates
  // (lib/firm-up.ts) over the actual spliced stop list instead of a flat
  // addDays(projectedEnd, shift) guess.
  const A: ProjectionStop = { id: "A", sortOrder: 1, arriveDate: "2026-12-15", departDate: "2026-12-22", nights: null, pinned: false };
  const B: ProjectionStop = { id: "B", sortOrder: 2, arriveDate: null, departDate: null, nights: 12, pinned: false };
  const base = { stops: [A, B], afterId: "A", startDate: "2026-12-04", hardEndDate: "2027-01-08" };

  it("rough: lands after the goes-after stop and counts the spare", () => {
    expect(addStopConsequence({ ...base, mode: "rough", nights: 5 })).toEqual({ text: "Lands on Tue 22 – Sun 27 Dec. 0 nights spare after this.", over: false });
  });
  it("pushes past the home-by date in coral", () => {
    expect(addStopConsequence({ ...base, mode: "rough", nights: 7 })).toEqual({ text: "Pushes you 2 nights past Fri 8 Jan.", over: true });
  });
  it("exact: uses the picked range", () => {
    expect(addStopConsequence({ ...base, mode: "exact", nights: 0, range: { arrive: "2026-12-22", depart: "2026-12-24" } })).toEqual({ text: "Lands on Tue 22 – Thu 24 Dec. 3 nights spare after this.", over: false });
  });
  it("no home-by: just where it lands; nothing to say at all → null", () => {
    expect(addStopConsequence({ ...base, hardEndDate: null, mode: "rough", nights: 2 })?.text).toBe("Lands on Tue 22 – Thu 24 Dec.");
    expect(addStopConsequence({ mode: "rough", nights: 2, stops: [], afterId: null, startDate: null, hardEndDate: null })).toBeNull();
  });
  it("singular night", () => {
    expect(addStopConsequence({ ...base, mode: "rough", nights: 4 })?.text).toBe("Lands on Tue 22 – Sat 26 Dec. 1 night spare after this.");
  });

  // Reviewer's mid-trip repro (task-5 review): rough A(2n) → SCHEDULED B (pinned,
  // Dec 10-15) → rough C(3n), hard end Dec 20. B is a fixed boundary: inserting
  // a rough stop between A and B just eats into the slack in front of B — the
  // plan's own end (driven by C, downstream of the pin) doesn't move. A flat
  // "shift everything by N nights" model gets this wrong (false "pushes past");
  // the engine-derived version must not.
  const midA: ProjectionStop = { id: "midA", sortOrder: 1, arriveDate: null, departDate: null, nights: 2, pinned: false };
  const midB: ProjectionStop = { id: "midB", sortOrder: 2, arriveDate: "2026-12-10", departDate: "2026-12-15", nights: null, pinned: false };
  const midC: ProjectionStop = { id: "midC", sortOrder: 3, arriveDate: null, departDate: null, nights: 3, pinned: false };
  const mid = { stops: [midA, midB, midC], startDate: "2026-12-01", hardEndDate: "2026-12-20" };

  it("a downstream pin absorbs the insertion — fits, no false 'Pushes you'", () => {
    const r = addStopConsequence({ ...mid, mode: "rough", nights: 5, afterId: "midA" });
    expect(r?.over).toBe(false);
    expect(r?.text).not.toMatch(/Pushes you/);
    // A(2n): Dec 1 -> Dec 3. New(5n) inserted after A: Dec 3 -> Dec 8. B is
    // pinned at Dec 10-15 regardless. C(3n) after B: Dec 15 -> Dec 18 (unmoved).
    // End stays Dec 18, 2 nights of slack before the Dec 20 hard end.
    expect(r).toEqual({ text: "Lands on Thu 3 – Tue 8 Dec. 2 nights spare after this.", over: false });
  });

  it("downstream of the pin is still flexible — genuinely runs over", () => {
    const r = addStopConsequence({ ...mid, mode: "rough", nights: 6, afterId: "midB" });
    // B pinned Dec 10-15. New(6n) after B: Dec 15 -> Dec 21. C(3n) after that:
    // Dec 21 -> Dec 24 — 4 nights past the Dec 20 hard end.
    expect(r).toEqual({ text: "Pushes you 4 nights past Sun 20 Dec.", over: true });
  });
});

describe("routeCentroid", () => {
  it("averages the located stops, null with none", () => {
    expect(routeCentroid([{ lat: 10, lng: 20 }, { lat: 20, lng: 40 }, { lat: null, lng: null }])).toEqual({ lat: 15, lng: 30 });
    expect(routeCentroid([{}])).toBeNull();
  });
});

const summary = (over: Partial<PlanSummary>): PlanSummary => ({
  stopCount: 6, roughCount: 1, scheduledNights: 28, projectedNights: 33,
  spanStart: "2026-12-04", scheduledEnd: "2027-01-01", projectedEnd: "2027-01-06",
  hardEndDate: "2027-01-08", hardEndState: "ok", hardEndSlackNights: 2, ...over,
});

describe("fitTileModel (PLAN.md §6.2)", () => {
  it("ok: teal, slack nights spare, a set + rough bar of the window", () => {
    const m = fitTileModel(summary({ hardEndState: "ok", hardEndSlackNights: 4 }));
    expect(m).toMatchObject({ tone: "teal", big: 4, words: "nights spare", pill: "FITS YOUR DATES", legendLeft: "28 set · ~5 rough", legendRight: "of 35" });
    expect(m.bar!.setPct).toBeCloseTo(80);
    expect(m.bar!.roughPct).toBeCloseTo((5 / 35) * 100);
    expect(m.bar!.overPct).toBe(0);
  });
  it("approaching: sun, 1 night spare or 0 right on it", () => {
    expect(fitTileModel(summary({ hardEndState: "approaching", hardEndSlackNights: 1 }))).toMatchObject({ tone: "sun", big: 1, words: "night spare" });
    expect(fitTileModel(summary({ hardEndState: "approaching", hardEndSlackNights: 0 }))).toMatchObject({ tone: "sun", big: 0, words: "right on it" });
  });
  it("over: coral, nights over, RUNS OVER, an overflow hatch", () => {
    const m = fitTileModel(summary({ hardEndState: "over", hardEndSlackNights: -2, projectedNights: 37 }));
    expect(m).toMatchObject({ tone: "coral", big: 2, words: "nights over", pill: "RUNS OVER" });
    expect(m.bar!.overPct).toBeGreaterThan(0);
  });
  it("unset and dormant: card, no number, no bar", () => {
    expect(fitTileModel(summary({ hardEndState: "unset", hardEndSlackNights: null, hardEndDate: null }))).toMatchObject({ tone: "card", big: null, words: "Set a home-by date", pill: null, bar: null });
    expect(fitTileModel(summary({ hardEndState: "dormant", hardEndSlackNights: null }))).toMatchObject({ tone: "card", big: null, words: "Set a start date to check this" });
  });
  it("no rough: the legend drops the rough part", () => {
    expect(fitTileModel(summary({ roughCount: 0, projectedNights: 28 })).legendLeft).toBe("28 set");
  });
});

describe("no ISO dates leak into any produced label", () => {
  const ISO = /\d{4}-\d{2}-\d{2}/;

  it("formatStayRange, tripEyebrow, planHeaderMeta", () => {
    expect(formatStayRange("2026-12-27", "2027-01-03")).not.toMatch(ISO);
    expect(tripEyebrow("Christmas in Europe", "2026-12-04")).not.toMatch(ISO);
    expect(planHeaderMeta({ stopCount: 6, roughCount: 1 }, "2026-12-04", "2027-01-08")).not.toMatch(ISO);
  });

  it("addStopConsequence — both the landing line and the past-home-by line", () => {
    const A: ProjectionStop = { id: "A", sortOrder: 1, arriveDate: "2026-12-15", departDate: "2026-12-22", nights: null, pinned: false };
    const B: ProjectionStop = { id: "B", sortOrder: 2, arriveDate: null, departDate: null, nights: 12, pinned: false };
    const base = { stops: [A, B], afterId: "A", startDate: "2026-12-04", hardEndDate: "2027-01-08" };
    expect(addStopConsequence({ ...base, mode: "rough", nights: 5 })?.text).not.toMatch(ISO);
    expect(addStopConsequence({ ...base, mode: "rough", nights: 7 })?.text).not.toMatch(ISO);
  });

  it("fitTileModel — words and legends across every hardEndState", () => {
    const states: Array<Partial<PlanSummary>> = [
      { hardEndState: "ok", hardEndSlackNights: 4 },
      { hardEndState: "approaching", hardEndSlackNights: 1 },
      { hardEndState: "over", hardEndSlackNights: -2, projectedNights: 37 },
      { hardEndState: "unset", hardEndSlackNights: null, hardEndDate: null },
      { hardEndState: "dormant", hardEndSlackNights: null },
    ];
    for (const over of states) {
      const m = fitTileModel(summary(over));
      expect(m.words).not.toMatch(ISO);
      expect(m.legendLeft).not.toMatch(ISO);
      if (m.legendRight) expect(m.legendRight).not.toMatch(ISO);
      if (m.pill) expect(m.pill).not.toMatch(ISO);
    }
  });
});
