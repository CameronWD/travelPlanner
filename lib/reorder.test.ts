import { describe, it, expect } from "vitest";
import { moveStopInOrder, moveChapterBlocks } from "./reorder";
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
