/**
 * Who may start a Review, and how often (spec 2026-10-17 R12, CONTEXT.md
 * "Review"). Pure, and safe for client code: it imports only plain values.
 *
 * OFF: no Review option anywhere and `review_trip` is not listed to Claude.
 * LIMITED: at most REVIEW_LIMIT_PER_DAY starts in any rolling 24 hours and
 * REVIEW_LIMIT_PER_WEEK in any rolling 7 days, per account across all Trips.
 * Standard and Deep each count one. A run counts when it completed or is
 * still running; a failed one (and a stale RUNNING row, which counts as
 * failed) does not. lib/review-permission-reads.ts loads the counted starts.
 * UNLIMITED: no cap.
 *
 * The per-Trip "one Review running at a time" rule applies to everyone and
 * lives with the start action, not here.
 */
import { REVIEW_PERMISSIONS, type ReviewPermission } from "@/lib/enum-values";

export const REVIEW_LIMIT_PER_DAY = 1;
export const REVIEW_LIMIT_PER_WEEK = 2;

const HOUR_MS = 3_600_000;
export const REVIEW_DAY_WINDOW_MS = 24 * HOUR_MS;
export const REVIEW_WEEK_WINDOW_MS = 7 * 24 * HOUR_MS;

/**
 * A RUNNING Review whose startedAt is older than this counts as FAILED: it
 * never blocks its Trip and never counts against its starter (decision 3).
 * The one definition; the start action, the reads and the tab all use it.
 */
export const REVIEW_STALE_AFTER_MS = 15 * 60_000;

const WINDOWS = [
  { ms: REVIEW_DAY_WINDOW_MS, limit: REVIEW_LIMIT_PER_DAY },
  { ms: REVIEW_WEEK_WINDOW_MS, limit: REVIEW_LIMIT_PER_WEEK },
] as const;

/** A stored value; anything unrecognised reads as OFF (least access). */
export function parseReviewPermission(raw: string | null | undefined): ReviewPermission {
  return (REVIEW_PERMISSIONS as readonly string[]).includes(raw ?? "") ? (raw as ReviewPermission) : "OFF";
}

/** The earliest start that can still count against `now`: the widest window back. */
export function countedSince(now: Date): Date {
  return new Date(now.getTime() - REVIEW_WEEK_WINDOW_MS);
}

export interface ReviewAllowance {
  canRun: boolean;
  /** LIMITED at the cap only: the moment every window has room again. */
  nextAvailableAt: Date | null;
}

/**
 * Whether this account may start a Review now, given the start times of its
 * counted runs (any order; older ones are ignored).
 *
 * A start is inside a window while `start > now - window`, so it leaves at
 * exactly `start + window`. A full window (holding `limit` or more) has room
 * again when its `limit`-th newest start leaves: sorted oldest first, that is
 * index `length - limit`. With both windows full the later of the two moments
 * is the first at which both have room, because windows only empty with time.
 */
export function reviewAllowance(
  permission: ReviewPermission,
  countedRunStarts: readonly Date[],
  now: Date,
): ReviewAllowance {
  if (permission === "OFF") return { canRun: false, nextAvailableAt: null };
  if (permission === "UNLIMITED") return { canRun: true, nextAvailableAt: null };

  const t = now.getTime();
  const starts = countedRunStarts.map((d) => d.getTime()).sort((a, b) => a - b);
  let freesAt: number | null = null;
  for (const w of WINDOWS) {
    const inWindow = starts.filter((s) => s > t - w.ms);
    if (inWindow.length < w.limit) continue;
    const at = inWindow[inWindow.length - w.limit] + w.ms;
    freesAt = freesAt === null ? at : Math.max(freesAt, at);
  }
  return freesAt === null ? { canRun: true, nextAvailableAt: null } : { canRun: false, nextAvailableAt: new Date(freesAt) };
}
