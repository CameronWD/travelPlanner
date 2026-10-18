import { isAiConfigured } from "@/lib/ai";
import { getReview, latestReview, listReviews, runningReview } from "@/lib/review-reads";
import { countedReviewStarts, reviewPermissionOf } from "@/lib/review-permission-reads";
import { reviewAllowance } from "@/lib/review-permission";
import { runPanelState, type RunPanelState } from "@/lib/review/run-panel";
import {
  REVIEW_KIND_LABELS, failedReviewText, partitionFindings, reviewByLine, reviewingLine, toFindingCard, toHistoryRow,
  type FindingCard, type FindingGroup, type HistoryRow,
} from "@/lib/review/view";
import type { ReviewStatus } from "@/lib/review/types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface ShownReview {
  id: string;
  heading: string;
  byLine: string;
  status: ReviewStatus;
  summary: string | null;
  /** A FAILED Review's line, naming why it stopped (final wave I2); null otherwise. */
  failure: string | null;
  open: FindingGroup[];
  dealtWith: FindingCard[];
  openCount: number;
  /**
   * The Trip's current, live Review: Apply/Dismiss show on its OPEN
   * Findings, and it is the one "This record is read-only" copy would name
   * as current. It is NOT the full gate for every button: Undo of an Apply
   * works on any Review, including one that is no longer latest, so each
   * FindingCard carries its own canApply/canDismiss/canUndo (R's FindingView
   * flags) for that — see lib/review/view.ts.
   */
  actionable: boolean;
  isLatest: boolean;
}

export interface ReviewsPageModel {
  panel: RunPanelState;
  running: { id: string; line: string } | null;
  /**
   * The Trip's newest Review, whatever its status (the history's first row):
   * ReviewPoller toasts its error when a run this tab watched ends FAILED.
   */
  latestRun: { id: string; status: ReviewStatus; error: string | null } | null;
  shown: ShownReview | null;
  history: HistoryRow[];
}

/**
 * Everything the Reviews tab shows (spec 2026-10-17 R10-R12), in one wave
 * after the page's access guard. Every Traveller on the Trip may read every
 * Review (R9); only the run panel depends on the viewer's permission.
 *
 * Returns null when `?review=` names a Review that exists but belongs to a
 * different Trip (an id the viewer could only have by editing the URL): the
 * page turns that into a 404. A `reviewId` that names no Review at all is
 * not handled here — lib/review-reads.ts's `getReview` already calls Next's
 * notFound() itself for that case (R9's own guard), so it propagates
 * straight through rather than being re-implemented at this layer.
 */
export async function loadReviewsPage(input: {
  tripId: string;
  userId: string;
  base: string;
  timeZone: string;
  reviewId: string | null;
  now: Date;
}): Promise<ReviewsPageModel | null> {
  const { tripId, userId, base, timeZone, reviewId, now } = input;
  const permissionPromise = reviewPermissionOf(userId);
  const [permission, starts, running, history, latest, selected] = await Promise.all([
    permissionPromise,
    // Limits apply to Limited only (decision 2), so only Limited pays for the count.
    permissionPromise.then((p) => (p === "LIMITED" ? countedReviewStarts(userId, new Date(now.getTime() - WEEK_MS)) : [])),
    runningReview(tripId),
    listReviews(tripId),
    latestReview(tripId),
    reviewId ? getReview(reviewId) : Promise.resolve(null),
  ]);

  if (selected && selected.tripId !== tripId) return null;

  const review = selected ?? latest;
  const isLatest = review != null && latest != null && review.id === latest.id;
  const ctx = { base, timeZone };
  const cards = review ? review.findings.map((f) => toFindingCard(f, ctx)) : [];
  const { open, dealtWith } = partitionFindings(cards);

  return {
    panel: runPanelState({
      permission,
      aiConfigured: isAiConfigured(),
      running: running != null,
      allowance: reviewAllowance(permission, starts, now),
    }),
    running: running ? { id: running.id, line: reviewingLine(running.startedBy) } : null,
    latestRun: history[0] ? { id: history[0].id, status: history[0].status, error: history[0].error } : null,
    shown: review
      ? {
          id: review.id,
          heading: REVIEW_KIND_LABELS[review.kind],
          byLine: reviewByLine(review, timeZone),
          status: review.status,
          summary: review.summary,
          failure: review.status === "FAILED" ? failedReviewText(review.error) : null,
          open,
          dealtWith,
          openCount: cards.filter((c) => c.state === "OPEN").length,
          actionable: isLatest && review.status === "DONE",
          isLatest,
        }
      : null,
    history: history.map((r) => toHistoryRow(r, { ...ctx, currentId: review?.id ?? null })),
  };
}
