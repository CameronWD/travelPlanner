import { describe, it, expect } from "vitest";
import { moveStopInOrder, moveChapterBlocks, insertionOrder, reflowReorderedDates } from "./reorder";
import { groupStopsByChapter } from "./chapters";
import type { ChapterLike, StopLike } from "./chapters";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal rough stop (no arriveDate). */
function roughStop(id: string, chapterId: string | null, sortOrder = 0) {
  return { id, chapterId, arriveDate: null, departDate: null, sortOrder };
}

/** Build a minimal dated stop. */
function datedStop(
  id: string,
  arriveDate: string,
  chapterId: string | null = null,
  sortOrder = 0,
) {
  return { id, chapterId, arriveDate, departDate: arriveDate, sortOrder };
}

/** Build a minimal chapter. */
function chapter(id: string, startDate: string | null = null): ChapterLike {
  return { id, name: id, colour: "rose", startDate, endDate: startDate };
}

/**
 * Verify that after grouping, no chapter id appears in two non-adjacent groups.
 * Returns true if ALL chapters form exactly ONE contiguous group.
 */
function isContiguous(result: Array<{ id: string; chapterId: string | null }>): boolean {
  const seen = new Set<string | null>();
  let prev: string | null | undefined = undefined;
  for (const s of result) {
    const cid = s.chapterId;
    if (cid !== prev) {
      if (seen.has(cid)) return false; // chapter id appears again after gap
      if (prev !== undefined) seen.add(prev);
      prev = cid;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// moveStopInOrder
// ---------------------------------------------------------------------------

describe("moveStopInOrder", () => {
  // ── Blocker repro: cross-container move must keep target chapter contiguous ──

  it("repro: moves a1 from cA into cB at end — cB stays contiguous", () => {
    //  Input:  [ a1:cA, a2:cA, b1:cB ]
    //  Move:   a1 → cB, targetIndex=1 (after b1)
    //  Expect: [ a2:cA, b1:cB, a1:cB ]   (cA and cB each form ONE group)
    const stops = [
      roughStop("a1", "cA", 0),
      roughStop("a2", "cA", 1),
      roughStop("b1", "cB", 0),
    ];

    const result = moveStopInOrder(stops, "a1", "cB", 1);

    // The two chapter blocks must each appear as ONE contiguous run.
    expect(isContiguous(result)).toBe(true);

    // Explicit shape: a2 stays in cA; b1 then a1 in cB.
    expect(result).toEqual([
      { id: "a2", chapterId: "cA" },
      { id: "b1", chapterId: "cB" },
      { id: "a1", chapterId: "cB" },
    ]);

    // Cross-check with groupStopsByChapter: each chapter is exactly ONE group.
    const chapters = [chapter("cA"), chapter("cB")];
    // Build StopLike-compatible objects for groupStopsByChapter.
    const stopsForGrouping: StopLike[] = result.map((s, i) => ({
      ...s,
      arriveDate: null,
      departDate: null,
      sortOrder: i,
    }));
    const groups = groupStopsByChapter(stopsForGrouping, chapters);
    const chapterIdCounts = new Map<string | null, number>();
    for (const g of groups) {
      const cid = g.chapter?.id ?? null;
      chapterIdCounts.set(cid, (chapterIdCounts.get(cid) ?? 0) + 1);
    }
    // Each chapter must appear as exactly ONE group (not fragmented).
    for (const [, count] of chapterIdCounts) {
      expect(count).toBe(1);
    }
  });

  it("repro: cross-container move result is NOT [b1:cB, a2:cA, a1:cB] (the broken order)", () => {
    const stops = [
      roughStop("a1", "cA", 0),
      roughStop("a2", "cA", 1),
      roughStop("b1", "cB", 0),
    ];

    const result = moveStopInOrder(stops, "a1", "cB", 1);
    const ids = result.map((s) => s.id);

    // The broken order produced by the old code was [b1, a2, a1].
    expect(ids).not.toEqual(["b1", "a2", "a1"]);
  });

  // ── Within-container reorder ──

  it("within-container: reorders stops inside the same chapter without fragmenting", () => {
    // Input:  [ a1:cA, a2:cA, a3:cA ]
    // Move a1 to position 2 (after a2, a3) → [ a2:cA, a3:cA, a1:cA ]
    const stops = [
      roughStop("a1", "cA", 0),
      roughStop("a2", "cA", 1),
      roughStop("a3", "cA", 2),
    ];

    const result = moveStopInOrder(stops, "a1", "cA", 2);

    expect(result).toEqual([
      { id: "a2", chapterId: "cA" },
      { id: "a3", chapterId: "cA" },
      { id: "a1", chapterId: "cA" },
    ]);
    expect(isContiguous(result)).toBe(true);
  });

  it("within-container: move to beginning", () => {
    const stops = [
      roughStop("a1", "cA", 0),
      roughStop("a2", "cA", 1),
      roughStop("a3", "cA", 2),
    ];
    const result = moveStopInOrder(stops, "a3", "cA", 0);
    expect(result.map((s) => s.id)).toEqual(["a3", "a1", "a2"]);
    expect(isContiguous(result)).toBe(true);
  });

  it("cross-container: move to the start of target chapter", () => {
    // Input:  [ a1:cA, a2:cA, b1:cB ]
    // Move a2 into cB at position 0 → [ a1:cA, a2:cB, b1:cB ]
    const stops = [
      roughStop("a1", "cA", 0),
      roughStop("a2", "cA", 1),
      roughStop("b1", "cB", 0),
    ];

    const result = moveStopInOrder(stops, "a2", "cB", 0);

    expect(result).toEqual([
      { id: "a1", chapterId: "cA" },
      { id: "a2", chapterId: "cB" },
      { id: "b1", chapterId: "cB" },
    ]);
    expect(isContiguous(result)).toBe(true);
  });

  it("dated stops keep their positions when a rough stop moves", () => {
    // Mix of dated and rough stops.
    // Input: [ d1(dated, cD), r1:cA, r2:cA, r3:cB ]
    // Move r1 → cB at end → [ d1, r2:cA, r3:cB, r1:cB ]
    const stops = [
      datedStop("d1", "2026-01-01", null, 0),
      roughStop("r1", "cA", 1),
      roughStop("r2", "cA", 2),
      roughStop("r3", "cB", 3),
    ];

    const result = moveStopInOrder(stops, "r1", "cB", 1);

    // d1 stays first (dated stop is positionally fixed).
    expect(result[0]).toEqual({ id: "d1", chapterId: null });
    // Rough stops are contiguous in their respective chapters.
    const roughPart = result.slice(1);
    expect(roughPart).toEqual([
      { id: "r2", chapterId: "cA" },
      { id: "r3", chapterId: "cB" },
      { id: "r1", chapterId: "cB" },
    ]);
  });

  it("lossless: no stops are added or dropped", () => {
    const stops = [
      roughStop("a1", "cA", 0),
      roughStop("a2", "cA", 1),
      roughStop("b1", "cB", 0),
      roughStop("b2", "cB", 1),
    ];
    const result = moveStopInOrder(stops, "a1", "cB", 2);
    const ids = result.map((s) => s.id).sort();
    expect(ids).toEqual(["a1", "a2", "b1", "b2"]);
  });
});

// ---------------------------------------------------------------------------
// moveChapterBlocks
// ---------------------------------------------------------------------------

describe("moveChapterBlocks", () => {
  // ── Important repro: ungrouped stays last, dated chapter stays first ──

  it("repro: reorder [cB,cA] from [cD-dated, cA, cB, ungrouped] keeps non-rough fixed", () => {
    // Render order: [cD-stops(dated), cA-stops, cB-stops, ungrouped]
    // Re-ordering rough chapters to [cB, cA] must yield:
    //   [cD-stops, cB-stops, cA-stops, ungrouped]
    // Note: cD is a DATED chapter, its stops are positionally fixed.
    const chapters: ChapterLike[] = [
      chapter("cD", "2026-01-01"), // dated → fixed
      chapter("cA"),               // rough → moveable
      chapter("cB"),               // rough → moveable
    ];

    const stops = [
      datedStop("d1", "2026-01-01", null, 0), // in cD (dated, positionally fixed)
      datedStop("d2", "2026-01-02", null, 1),
      roughStop("a1", "cA", 2),
      roughStop("a2", "cA", 3),
      roughStop("b1", "cB", 4),
      roughStop("b2", "cB", 5),
      roughStop("u1", null, 6), // ungrouped rough
    ];

    const result = moveChapterBlocks(stops, chapters, ["cB", "cA"]);

    // Ungrouped and dated stops keep their original positions.
    expect(result[0]).toEqual({ id: "d1", chapterId: null });
    expect(result[1]).toEqual({ id: "d2", chapterId: null });
    expect(result[6]).toEqual({ id: "u1", chapterId: null });

    // Rough chapter blocks are permuted: cB first, then cA.
    const roughPart = result.slice(2, 6);
    expect(roughPart).toEqual([
      { id: "b1", chapterId: "cB" },
      { id: "b2", chapterId: "cB" },
      { id: "a1", chapterId: "cA" },
      { id: "a2", chapterId: "cA" },
    ]);

    // Lossless: same set of ids.
    const originalIds = stops.map((s) => s.id).sort();
    const resultIds = result.map((s) => s.id).sort();
    expect(resultIds).toEqual(originalIds);
  });

  it("repro: ungrouped stays LAST after a chapter reorder", () => {
    const chapters: ChapterLike[] = [chapter("cA"), chapter("cB")];
    const stops = [
      roughStop("a1", "cA", 0),
      roughStop("b1", "cB", 1),
      roughStop("u1", null, 2), // ungrouped
    ];

    const result = moveChapterBlocks(stops, chapters, ["cB", "cA"]);

    // Ungrouped stays at its original slot (last).
    expect(result[result.length - 1]).toEqual({ id: "u1", chapterId: null });
    // Rough blocks permuted.
    expect(result[0]).toEqual({ id: "b1", chapterId: "cB" });
    expect(result[1]).toEqual({ id: "a1", chapterId: "cA" });
  });

  it("simple two-chapter swap", () => {
    const chapters: ChapterLike[] = [chapter("cA"), chapter("cB")];
    const stops = [
      roughStop("a1", "cA", 0),
      roughStop("a2", "cA", 1),
      roughStop("b1", "cB", 2),
    ];

    const result = moveChapterBlocks(stops, chapters, ["cB", "cA"]);

    expect(result).toEqual([
      { id: "b1", chapterId: "cB" },
      { id: "a1", chapterId: "cA" },
      { id: "a2", chapterId: "cA" },
    ]);
  });

  it("lossless: set of ids unchanged after reorder", () => {
    const chapters: ChapterLike[] = [chapter("c1"), chapter("c2"), chapter("c3")];
    const stops = [
      roughStop("s1", "c1", 0),
      roughStop("s2", "c2", 1),
      roughStop("s3", "c2", 2),
      roughStop("s4", "c3", 3),
      roughStop("u1", null, 4),
    ];

    const result = moveChapterBlocks(stops, chapters, ["c3", "c1", "c2"]);

    const originalIds = stops.map((s) => s.id).sort();
    const resultIds = result.map((s) => s.id).sort();
    expect(resultIds).toEqual(originalIds);
  });

  it("no-op when chapter order is unchanged", () => {
    const chapters: ChapterLike[] = [chapter("cA"), chapter("cB")];
    const stops = [
      roughStop("a1", "cA", 0),
      roughStop("b1", "cB", 1),
    ];

    const result = moveChapterBlocks(stops, chapters, ["cA", "cB"]);

    expect(result).toEqual([
      { id: "a1", chapterId: "cA" },
      { id: "b1", chapterId: "cB" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// insertionOrder
// ---------------------------------------------------------------------------

describe("insertionOrder", () => {
  it("inserts after the anchor and bumps later siblings", () => {
    const stops = [{ id: "a", sortOrder: 0 }, { id: "b", sortOrder: 1 }, { id: "c", sortOrder: 2 }];
    const r = insertionOrder(stops, "a");
    expect(r.sortOrder).toBe(1);
    expect(r.renumber).toEqual([{ id: "b", sortOrder: 2 }, { id: "c", sortOrder: 3 }]);
  });

  it("appends when anchor is null", () => {
    const stops = [{ id: "a", sortOrder: 0 }];
    expect(insertionOrder(stops, null)).toEqual({ sortOrder: 1, renumber: [] });
  });

  it("appends when anchor is not found", () => {
    const stops = [{ id: "a", sortOrder: 0 }, { id: "b", sortOrder: 1 }];
    expect(insertionOrder(stops, "z")).toEqual({ sortOrder: 2, renumber: [] });
  });

  it("inserts at the start when anchor is the last with sortOrder 0 and no later siblings", () => {
    const stops = [{ id: "a", sortOrder: 5 }];
    const r = insertionOrder(stops, "a");
    expect(r.sortOrder).toBe(6);
    expect(r.renumber).toEqual([]);
  });

  it("appends when stops is empty", () => {
    expect(insertionOrder([], null)).toEqual({ sortOrder: 0, renumber: [] });
  });
});

// ---------------------------------------------------------------------------
// reflowReorderedDates
// ---------------------------------------------------------------------------

describe("reflowReorderedDates", () => {
  // Test 1: All-scheduled reorder — dates reflow contiguously from anchor,
  // each stop's nights preserved; changed=true for stops whose dates moved.
  it("reflows all-scheduled stops contiguously from the anchor, preserving nights", () => {
    // Stop "a" was 2026-07-01→07-04 (3 nights), stop "b" was 2026-07-04→07-06 (2 nights).
    // After reordering to [b, a] with anchor 2026-07-01:
    //   b: arrive 2026-07-01, depart 2026-07-03 (2 nights) — moved, changed=true
    //   a: arrive 2026-07-03, depart 2026-07-06 (3 nights) — moved, changed=true
    const ordered = [
      { id: "b", nights: 2, arriveDate: "2026-07-04", departDate: "2026-07-06", pinned: false },
      { id: "a", nights: 3, arriveDate: "2026-07-01", departDate: "2026-07-04", pinned: false },
    ];
    const { results, conflicts } = reflowReorderedDates(ordered, "2026-07-01");

    expect(conflicts).toHaveLength(0);
    expect(results).toHaveLength(2);

    const b = results.find((r) => r.id === "b")!;
    const a = results.find((r) => r.id === "a")!;

    // b flows first from anchor
    expect(b.arriveDate).toBe("2026-07-01");
    expect(b.departDate).toBe("2026-07-03");
    expect(b.changed).toBe(true);

    // a flows after b
    expect(a.arriveDate).toBe("2026-07-03");
    expect(a.departDate).toBe("2026-07-06");
    expect(a.changed).toBe(true);
  });

  // Test 2: Pinned stop keeps exact dates; non-pinned flow around it;
  // conflict when flexible stops can't fit before the pin.
  it("pinned scheduled stop keeps its dates and others flow around it", () => {
    // pin "a": fixed at 2026-07-01→07-04 (3 nights).
    // "b": 2 nights, unscheduled position (was after a in old order).
    // New order: [b, a]. anchor 2026-06-28.
    // b should flow 2026-06-28→06-30 (2 nights), fitting before the pin.
    // a stays pinned at 2026-07-01→07-04.
    const ordered = [
      { id: "b", nights: 2, arriveDate: "2026-07-04", departDate: "2026-07-06", pinned: false },
      { id: "a", nights: 3, arriveDate: "2026-07-01", departDate: "2026-07-04", pinned: true },
    ];
    const { results, conflicts } = reflowReorderedDates(ordered, "2026-06-28");

    expect(conflicts).toHaveLength(0);

    const a = results.find((r) => r.id === "a")!;
    const b = results.find((r) => r.id === "b")!;

    // Pinned stop keeps exact dates.
    expect(a.arriveDate).toBe("2026-07-01");
    expect(a.departDate).toBe("2026-07-04");
    expect(a.changed).toBe(false);

    // b flows from anchor and fits before the pin.
    expect(b.arriveDate).toBe("2026-06-28");
    expect(b.departDate).toBe("2026-06-30");
    expect(b.changed).toBe(true);
  });

  it("reports a conflict when flexible stops cannot fit before a pin", () => {
    // pin "a": fixed at 2026-07-01→07-04.
    // "b": 5 nights — from anchor 2026-06-28, b would end 2026-07-03, past pin arrive 2026-07-01.
    const ordered = [
      { id: "b", nights: 5, arriveDate: "2026-07-04", departDate: "2026-07-09", pinned: false },
      { id: "a", nights: 3, arriveDate: "2026-07-01", departDate: "2026-07-04", pinned: true },
    ];
    const { results, conflicts } = reflowReorderedDates(ordered, "2026-06-28");

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].stopId).toBe("a");

    // Assert: pinned stop is still present in results with its fixed date unchanged.
    const pinnedStop = results.find((r) => r.id === "a");
    expect(pinnedStop).toBeDefined();
    expect(pinnedStop?.arriveDate).toBe("2026-07-01");
    expect(pinnedStop?.departDate).toBe("2026-07-04");
  });

  // Test 3: Mixed rough+scheduled — rough stops get no dates, do not consume
  // calendar time, and scheduled stops flow as if rough ones weren't there.
  it("rough stops are excluded from reflow and do not shift scheduled dates", () => {
    // rough "r": no dates. scheduled "x": 2 nights. scheduled "y": 3 nights.
    // Anchor 2026-07-01. Order: [r, x, y].
    // x should flow from anchor: 2026-07-01→07-03.
    // y follows x: 2026-07-03→07-06.
    // r gets no dates.
    const ordered = [
      { id: "r", nights: 4, arriveDate: null, departDate: null, pinned: false },
      { id: "x", nights: 2, arriveDate: "2026-07-05", departDate: "2026-07-07", pinned: false },
      { id: "y", nights: 3, arriveDate: "2026-07-07", departDate: "2026-07-10", pinned: false },
    ];
    const { results, conflicts } = reflowReorderedDates(ordered, "2026-07-01");

    expect(conflicts).toHaveLength(0);

    // Only scheduled stops in results.
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.id === "r")).toBeUndefined();

    const x = results.find((r) => r.id === "x")!;
    const y = results.find((r) => r.id === "y")!;

    expect(x.arriveDate).toBe("2026-07-01");
    expect(x.departDate).toBe("2026-07-03");
    expect(x.changed).toBe(true);

    expect(y.arriveDate).toBe("2026-07-03");
    expect(y.departDate).toBe("2026-07-06");
    expect(y.changed).toBe(true);
  });

  it("returns empty shape when anchorDate is null", () => {
    const ordered = [
      { id: "a", nights: 3, arriveDate: "2026-07-01", departDate: "2026-07-04", pinned: false },
      { id: "b", nights: 2, arriveDate: "2026-07-04", departDate: "2026-07-06", pinned: false },
    ];
    const { results, conflicts } = reflowReorderedDates(ordered, null);

    expect(results).toEqual([]);
    expect(conflicts).toEqual([]);
  });
});
