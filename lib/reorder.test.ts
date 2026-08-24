import { describe, it, expect } from "vitest";
import { moveStopInOrder, moveChapterBlocks, insertionOrder, spanReflow, collisionPush, type SpanStop } from "./reorder";
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
// spanReflow (ADR 0038)
// ---------------------------------------------------------------------------

const sp = (id: string, arriveDate: string, departDate: string, pinned = false): SpanStop =>
  ({ id, arriveDate, departDate, pinned });

describe("spanReflow (ADR 0038)", () => {
  // The ADR's worked example: A(1–4) B(4–7) ··2-day gap·· C(9–12) D(12–15); drag C before B.
  const A = sp("A", "2026-06-01", "2026-06-04");
  const B = sp("B", "2026-06-04", "2026-06-07");
  const C = sp("C", "2026-06-09", "2026-06-12");
  const D = sp("D", "2026-06-12", "2026-06-15");

  it("re-dates only the affected span and leaves stops outside untouched", () => {
    const { results, conflicts } = spanReflow([A, B, C, D], [A, C, B, D], new Set(["C"]));
    expect(conflicts).toEqual([]);
    // Window = indices 1..2. A and D are not in results at all.
    expect(results.map((r) => r.id)).toEqual(["C", "B"]);
    expect(results[0]).toMatchObject({ id: "C", arriveDate: "2026-06-04", departDate: "2026-06-07", changed: true });
    expect(results[1]).toMatchObject({ id: "B", arriveDate: "2026-06-07", departDate: "2026-06-10", changed: true });
  });

  it("returns empty when the order did not change", () => {
    expect(spanReflow([A, B, C, D], [A, B, C, D], new Set(["B"])).results).toEqual([]);
  });

  it("preserves an unmoved stop's lead-in gap", () => {
    // A(1–4) C(4–7) ··2 gap·· B(9–12) D(12–15); drag C after B → A B C D.
    const C2 = sp("C", "2026-06-04", "2026-06-07");
    const B2 = sp("B", "2026-06-09", "2026-06-12");
    const { results } = spanReflow([A, C2, B2, D], [A, B2, C2, D], new Set(["C"]));
    // B keeps its 2-day lead-in from window start (06-04 → arrives 06-06).
    expect(results[0]).toMatchObject({ id: "B", arriveDate: "2026-06-06", departDate: "2026-06-09" });
    expect(results[1]).toMatchObject({ id: "C", arriveDate: "2026-06-09", departDate: "2026-06-12" });
  });

  it("keeps a moved block's internal gaps (chapter drag)", () => {
    // Drag block [C,D] (with no internal gap) before B: only first-of-block loses lead-in.
    const { results } = spanReflow([A, B, C, D], [A, C, D, B], new Set(["C", "D"]));
    expect(results.map((r) => r.id)).toEqual(["C", "D", "B"]);
    expect(results[0]).toMatchObject({ id: "C", arriveDate: "2026-06-04" }); // lead 0 (moved, first)
    expect(results[1]).toMatchObject({ id: "D", arriveDate: "2026-06-07" }); // kept lead 0
    expect(results[2]).toMatchObject({ id: "B", arriveDate: "2026-06-10" }); // kept lead 0
  });

  it("holds pinned stops and reports a conflict when the span cannot fit", () => {
    const Bpin = sp("B", "2026-06-04", "2026-06-07", true);
    const { results, conflicts } = spanReflow([A, Bpin, C, D], [A, C, Bpin, D], new Set(["C"]));
    const pinned = results.find((r) => r.id === "B")!;
    expect(pinned).toMatchObject({ arriveDate: "2026-06-04", departDate: "2026-06-07", changed: false });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].stopId).toBe("B");
  });
});

// ---------------------------------------------------------------------------
// collisionPush (ADR 0038)
// ---------------------------------------------------------------------------

describe("collisionPush (ADR 0038)", () => {
  it("pushes only overlapped followers, letting gaps absorb", () => {
    // Edited stop now departs 06-06. B(4–7) overlaps → pushed. Gap-stop D(12–15) untouched.
    const followers = [sp("B", "2026-06-04", "2026-06-07"), sp("D", "2026-06-12", "2026-06-15")];
    const { results, conflicts } = collisionPush(followers, "2026-06-06");
    expect(conflicts).toEqual([]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: "B", arriveDate: "2026-06-06", departDate: "2026-06-09" });
  });

  it("propagates a push down a glued chain", () => {
    const followers = [sp("B", "2026-06-04", "2026-06-07"), sp("C", "2026-06-07", "2026-06-10")];
    const { results } = collisionPush(followers, "2026-06-06");
    expect(results.map((r) => r.id)).toEqual(["B", "C"]);
    expect(results[1]).toMatchObject({ arriveDate: "2026-06-09", departDate: "2026-06-12" });
  });

  it("never moves anyone when the edit shrank the stay", () => {
    expect(collisionPush([sp("B", "2026-06-04", "2026-06-07")], "2026-06-03").results).toEqual([]);
  });

  it("holds a pinned follower and flags it", () => {
    const { results, conflicts } = collisionPush([sp("B", "2026-06-04", "2026-06-07", true)], "2026-06-06");
    expect(results).toEqual([]);
    expect(conflicts[0].stopId).toBe("B");
  });
});
