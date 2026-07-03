/**
 * Pure, no-React reorder helpers for dnd-kit drag operations.
 *
 * Both functions are intentionally side-effect-free so they can be unit-tested
 * in isolation and reused from itinerary-manager.tsx.
 */

import { nightsBetween } from "./dates";
import { flowDates } from "./firm-up";
import type { FlowConflict, FlowResult } from "./firm-up";

/**
 * Compute the sortOrder for a new stop inserted after `afterStopId`, and the
 * renumber list of sibling stops whose sortOrder must be bumped up by 1.
 *
 * When `afterStopId` is null or not found, the new stop is appended after all
 * existing stops (no siblings are renumbered).
 */
export function insertionOrder(
  stops: { id: string; sortOrder: number }[],
  afterStopId: string | null,
): { sortOrder: number; renumber: { id: string; sortOrder: number }[] } {
  if (!afterStopId) {
    const max = stops.reduce((m, s) => Math.max(m, s.sortOrder), -1);
    return { sortOrder: max + 1, renumber: [] };
  }
  const anchor = stops.find((s) => s.id === afterStopId);
  if (!anchor) {
    const max = stops.reduce((m, s) => Math.max(m, s.sortOrder), -1);
    return { sortOrder: max + 1, renumber: [] };
  }
  const newOrder = anchor.sortOrder + 1;
  const renumber = stops
    .filter((s) => s.sortOrder >= newOrder)
    .map((s) => ({ id: s.id, sortOrder: s.sortOrder + 1 }));
  return { sortOrder: newOrder, renumber };
}

import type { ChapterLike } from "./chapters";

export interface StopSlim {
  id: string;
  chapterId: string | null;
}

/** Internal: stops that also carry arriveDate so we can separate dated from rough. */
type StopWithDate = StopSlim & { arriveDate?: string | null };

/**
 * Move a single ROUGH stop into a target chapter at a given position,
 * keeping the target chapter's block contiguous in the global array.
 *
 * Rules:
 *  - Dated stops (arriveDate != null) are never moved; they keep their
 *    original positions and chapterId values.
 *  - The active stop is REMOVED from its current slot and RE-INSERTED into
 *    the target chapter's contiguous block at `targetIndex`.
 *  - If the active stop is already in the target chapter, this is a
 *    within-container reorder.
 *
 * @param stops           Current ordered list of all stops (rough + dated).
 *                        Elements should carry `arriveDate` so dated stops can
 *                        be identified; ItineraryStop satisfies this.
 * @param activeId        ID of the rough stop being moved.
 * @param targetChapterId Chapter to drop into (null = ungrouped).
 * @param targetIndex     0-based insertion position within that chapter's block.
 * @returns               New ordered array of { id, chapterId } for all stops.
 */
export function moveStopInOrder(
  stops: readonly StopSlim[],
  activeId: string,
  targetChapterId: string | null,
  targetIndex: number,
): StopSlim[] {
  const fullStops = stops as readonly StopWithDate[];

  // Separate dated stops (positionally fixed) from rough stops (moveable).
  const datedSlots: Array<{ globalIdx: number; stop: StopSlim }> = [];
  const roughList: StopSlim[] = [];

  for (let i = 0; i < fullStops.length; i++) {
    const s = fullStops[i];
    if (s.arriveDate != null) {
      datedSlots.push({ globalIdx: i, stop: { id: s.id, chapterId: s.chapterId } });
    } else {
      roughList.push({ id: s.id, chapterId: s.chapterId });
    }
  }

  // Remove the active stop from the rough list.
  const activeIdx = roughList.findIndex((s) => s.id === activeId);
  if (activeIdx === -1) {
    // Active stop not found (e.g. it's dated) — return unchanged.
    return stops.map((s) => ({ id: s.id, chapterId: s.chapterId }));
  }
  roughList.splice(activeIdx, 1);

  // Update the active stop's chapterId to the target.
  const activeStop: StopSlim = { id: activeId, chapterId: targetChapterId };

  // Find the target chapter's contiguous block in the rough list.
  const targetGroupIndices: number[] = [];
  for (let i = 0; i < roughList.length; i++) {
    if (roughList[i].chapterId === targetChapterId) {
      targetGroupIndices.push(i);
    }
  }

  let insertAt: number;
  if (targetGroupIndices.length === 0) {
    // No existing stops in the target chapter yet — append at end of rough list.
    insertAt = roughList.length;
  } else {
    const firstInGroup = targetGroupIndices[0];
    const clampedIdx = Math.max(0, Math.min(targetIndex, targetGroupIndices.length));
    insertAt = firstInGroup + clampedIdx;
  }

  roughList.splice(insertAt, 0, activeStop);

  // Reassemble: interleave dated stops back at their original global positions,
  // filling remaining slots with the reordered rough list.
  const result: StopSlim[] = [];
  let roughCursor = 0;
  let datedCursor = 0;

  for (let globalIdx = 0; result.length < stops.length; globalIdx++) {
    const nextDated = datedCursor < datedSlots.length ? datedSlots[datedCursor] : null;
    if (nextDated && nextDated.globalIdx === globalIdx) {
      result.push(nextDated.stop);
      datedCursor++;
    } else if (roughCursor < roughList.length) {
      result.push(roughList[roughCursor++]);
    }
  }

  return result;
}

/**
 * Permute rough-chapter stop BLOCKS to match a new chapter order, while
 * keeping dated stops and ungrouped stops at their original positions/slots.
 *
 * Rules:
 *  - Only rough-chapter blocks move; they occupy the same aggregate array
 *    slots they originally occupied (the "rough chapter zone").
 *  - Dated stops keep their original indices (positionally fixed).
 *  - Ungrouped rough stops (chapterId === null) keep their original slots.
 *  - The operation is lossless: no stop is added, dropped, or duplicated.
 *
 * @param stops                  Current ordered list of all stops.
 * @param chapters               All chapters (used to identify rough vs dated).
 * @param orderedRoughChapterIds New order for rough chapters.
 * @returns                      New ordered array of { id, chapterId } for all stops.
 */
export function moveChapterBlocks(
  stops: readonly StopSlim[],
  chapters: readonly ChapterLike[],
  orderedRoughChapterIds: readonly string[],
): StopSlim[] {
  const fullStops = stops as readonly StopWithDate[];
  const roughChapterIdSet = new Set(orderedRoughChapterIds);

  // Collect the rough-chapter-block slots (their global indices) and the
  // current stop contents of each block.
  const roughZoneIndices: number[] = [];
  const blockByChapterId = new Map<string, StopSlim[]>();
  for (const id of orderedRoughChapterIds) {
    blockByChapterId.set(id, []);
  }

  // Fixed slots: dated stops and ungrouped stops stay put.
  const result: (StopSlim | undefined)[] = new Array(fullStops.length).fill(undefined);

  for (let i = 0; i < fullStops.length; i++) {
    const s = fullStops[i];
    const slim: StopSlim = { id: s.id, chapterId: s.chapterId };

    if (s.arriveDate != null) {
      // Dated stop → fixed at this index.
      result[i] = slim;
    } else if (s.chapterId != null && roughChapterIdSet.has(s.chapterId)) {
      // Rough stop in a moveable rough chapter → record in block + note index.
      roughZoneIndices.push(i);
      blockByChapterId.get(s.chapterId)!.push(slim);
    } else {
      // Ungrouped rough stop (or in a dated chapter — shouldn't happen) → fixed.
      result[i] = slim;
    }
  }

  // Build the new sequence of rough stops in the new chapter order.
  const newRoughSequence: StopSlim[] = orderedRoughChapterIds.flatMap(
    (id) => blockByChapterId.get(id) ?? [],
  );

  // Fill the rough zone slots with the permuted sequence.
  for (let i = 0; i < roughZoneIndices.length; i++) {
    result[roughZoneIndices[i]] = newRoughSequence[i];
  }

  return result as StopSlim[];
}

// ---------------------------------------------------------------------------
// reflowReorderedDates (ADR 0021)
// ---------------------------------------------------------------------------

/**
 * Input shape for reflowReorderedDates. Scheduled stops have non-null
 * arriveDate/departDate; rough stops have null dates.
 */
export interface ReflowStop {
  id: string;
  nights: number | null;
  arriveDate: string | null;
  departDate: string | null;
  pinned: boolean;
}

/**
 * Result for a single scheduled stop after reflow.
 */
export interface ReflowResult {
  id: string;
  arriveDate: string;
  departDate: string;
  /** True when the recomputed dates differ from the stop's original dates. */
  changed: boolean;
}

/**
 * Given a list of stops in their NEW desired order (post-drag), reflow calendar
 * dates for the SCHEDULED stops only, flowing contiguously from `anchorDate`.
 *
 * Rough stops (null arriveDate) are NOT dated and do NOT consume calendar time —
 * they are filtered out before flowing. Only the scheduled stops appear in
 * `results`, in the new order.
 *
 * Each scheduled stop's `nights` is derived from its current duration
 * (nightsBetween(arriveDate, departDate)), so the stay length is preserved.
 * Pinned scheduled stops keep their exact dates (flowDates handles this).
 * If flexible stops can't fit before a pin, a conflict is reported.
 *
 * If `anchorDate` is null or empty, returns the empty shape (nothing can be
 * dated without an anchor).
 *
 * Return shape: { results: ReflowResult[]; conflicts: FlowConflict[] }
 *   - results: scheduled stops only, in new order, with recomputed dates.
 *   - conflicts: passed through from flowDates for Task 9 to handle.
 */
export function reflowReorderedDates(
  orderedStops: readonly ReflowStop[],
  anchorDate: string | null,
): { results: ReflowResult[]; conflicts: FlowConflict[] } {
  // Guard: if no anchor, nothing can be dated.
  if (!anchorDate) {
    return { results: [], conflicts: [] };
  }

  // Filter to scheduled stops only (rough stops are untouched and excluded).
  const scheduledStops = orderedStops.filter(
    (s): s is ReflowStop & { arriveDate: string; departDate: string } =>
      s.arriveDate !== null && s.departDate !== null,
  );

  if (scheduledStops.length === 0) {
    return { results: [], conflicts: [] };
  }

  // Map to FlowStop, deriving nights from the current duration.
  const flowStops = scheduledStops.map((s) => ({
    id: s.id,
    nights: nightsBetween(s.arriveDate, s.departDate),
    pinned: s.pinned,
    arriveDate: s.arriveDate,
    departDate: s.departDate,
  }));

  const { results: flowResults, conflicts } = flowDates(flowStops, anchorDate);

  // Map FlowResult → ReflowResult, resolving the changed flag against original dates.
  const results: ReflowResult[] = flowResults.map((fr: FlowResult) => {
    const original = scheduledStops.find((s) => s.id === fr.id)!;
    return {
      id: fr.id,
      arriveDate: fr.arriveDate,
      departDate: fr.departDate,
      changed: fr.arriveDate !== original.arriveDate || fr.departDate !== original.departDate,
    };
  });

  return { results, conflicts };
}
