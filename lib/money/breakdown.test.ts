import { describe, it, expect } from "vitest";
import {
  budgetCategoryStyle,
  breakdownOptions,
  parseBy,
  rowsFor,
  segmentsFor,
  type BreakdownBudget,
} from "./breakdown";

const zero = { costTotalMinor: 0, paidTotalMinor: 0 };
const BUDGET: BreakdownBudget = {
  grandTotal: {
    costTotalMinor: 100000,
    paidTotalMinor: 20000,
    beforeTotalMinor: 100000,
    onTripTotalMinor: 0,
    beforePaidMinor: 20000,
    onTripPaidMinor: 0,
  },
  byCategory: [
    { category: "Transport", costTotalMinor: 42000, paidTotalMinor: 10000 },
    { category: "Accommodation", costTotalMinor: 35000, paidTotalMinor: 10000 },
    { category: "Sightseeing", costTotalMinor: 11000, paidTotalMinor: 0 },
    { category: "Food & Drink", costTotalMinor: 8000, paidTotalMinor: 0 },
    { category: "Insurance", costTotalMinor: 3500, paidTotalMinor: 0 },
    { category: "Visas & Docs", costTotalMinor: 500, paidTotalMinor: 0 },
  ],
  byStop: [
    { stopId: "s1", stopName: "Rome", costTotalMinor: 60000, paidTotalMinor: 20000 },
    { stopId: "s2", stopName: "Paris", costTotalMinor: 30000, paidTotalMinor: 0 },
    { stopId: null, stopName: "Trip-wide / Other", costTotalMinor: 10000, paidTotalMinor: 0 },
  ],
  byDay: [
    { dateISO: "2026-12-12", costTotalMinor: 5000, paidTotalMinor: 0 },
    { dateISO: "2026-12-13", costTotalMinor: 0, paidTotalMinor: 0 },
  ],
  byChapter: [{ chapterId: "c1", chapterName: "Italy", colour: "orange", costTotalMinor: 60000, paidTotalMinor: 20000 }],
  chapterReconciliation: {
    ungrouped: { costTotalMinor: 30000, paidTotalMinor: 0 },
    betweenLegs: zero,
    otherCosts: { costTotalMinor: 10000, paidTotalMinor: 0 },
  },
};

describe("budgetCategoryStyle", () => {
  it("maps the handoff's five groups onto the ramp", () => {
    expect(budgetCategoryStyle("Transport")).toEqual({ hue: "sun", icon: "transport" });
    expect(budgetCategoryStyle("Accommodation")).toEqual({ hue: "teal", icon: "accommodation" });
    expect(budgetCategoryStyle("Food & Drink")).toEqual({ hue: "leaf", icon: "food" });
    for (const label of ["Sightseeing", "Activity", "Activities", "Getting around", "Nightlife"]) {
      expect(budgetCategoryStyle(label)).toEqual({ hue: "coral", icon: "activity" });
    }
    for (const label of ["Other", "Insurance", "Visas & Docs", "anything typed"]) {
      expect(budgetCategoryStyle(label)).toEqual({ hue: "lilac", icon: "other" });
    }
  });
});

describe("breakdownOptions and parseBy", () => {
  it("offers Chapter and Day only when they have something to show", () => {
    expect(breakdownOptions({ chapters: false, days: true }).map((o) => o.label)).toEqual(["Category", "Place", "Day"]);
    expect(breakdownOptions({ chapters: true, days: false }).map((o) => o.value)).toEqual(["category", "place", "chapter"]);
  });
  it("falls back to category for anything unavailable or unknown", () => {
    const all = ["category", "place", "chapter", "day"] as const;
    expect(parseBy(undefined, all)).toBe("category");
    expect(parseBy("place", all)).toBe("place");
    expect(parseBy(["chapter", "day"], all)).toBe("chapter");
    expect(parseBy("chapter", ["category", "place"])).toBe("category");
    expect(parseBy("bogus", all)).toBe("category");
  });
});

describe("rowsFor", () => {
  it("category: hue, icon, percent and the missing-rate flag", () => {
    const rows = rowsFor(BUDGET, "category", { missingRateCategories: new Set(["Insurance"]) });
    expect(rows.map((r) => r.label)).toEqual(["Transport", "Accommodation", "Sightseeing", "Food & Drink", "Insurance", "Visas & Docs"]);
    expect(rows.map((r) => r.hue)).toEqual(["sun", "teal", "coral", "leaf", "lilac", "lilac"]);
    expect(rows[0]).toMatchObject({ icon: "transport", pct: 42, costMinor: 42000, paidMinor: 10000, muted: false, missingRate: false });
    expect(rows[4].missingRate).toBe(true);
  });
  it("place: a stop in a chapter takes the chapter's colour, others cycle the ramp, trip-wide is stone", () => {
    const rows = rowsFor(BUDGET, "place", { stopChapterColour: new Map([["s1", "orange"]]) });
    expect(rows.map((r) => [r.label, r.hue, r.icon])).toEqual([
      ["Rome", "coral", null],
      ["Paris", "teal", null],
      ["Trip-wide / Other", "stone", null],
    ]);
  });
  it("chapter: chapter rows, then only the non-zero reconciliation rows, muted and without a swatch", () => {
    const rows = rowsFor(BUDGET, "chapter");
    expect(rows.map((r) => [r.label, r.hue, r.muted, r.chapterColour])).toEqual([
      ["Italy", "coral", false, "orange"],
      ["Ungrouped", null, true, undefined],
      ["Other costs", null, true, undefined],
    ]);
  });
  it("day: only costed days, labelled like 'Sat 12 Dec', with no percent", () => {
    const rows = rowsFor(BUDGET, "day");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "Sat 12 Dec", pct: null, costMinor: 5000 });
  });
});

describe("segmentsFor", () => {
  it("one segment per row, merging anything under 1% into a trailing stone segment", () => {
    const segs = segmentsFor(rowsFor(BUDGET, "category"), 100000);
    expect(segs.map((s) => s.hue)).toEqual(["sun", "teal", "coral", "leaf", "lilac", "stone"]);
    expect(segs[0].fraction).toBeCloseTo(0.42);
    expect(segs[5]).toEqual({ key: "__small", hue: "stone", fraction: 0.005 });
  });
  it("rows without a swatch go into the stone tail too, so the bar fills", () => {
    const segs = segmentsFor(rowsFor(BUDGET, "chapter"), 100000);
    expect(segs.map((s) => [s.hue, s.fraction])).toEqual([
      ["coral", 0.6],
      ["stone", 0.4],
    ]);
  });
  it("is empty with no total", () => {
    expect(segmentsFor(rowsFor(BUDGET, "category"), 0)).toEqual([]);
  });
});
