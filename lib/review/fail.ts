import "server-only";
import { reportError } from "@/lib/error-sink";
import { markReviewFailed } from "@/lib/review-store";

/**
 * Mark a Review FAILED with a Traveller-facing reason (REVIEW_MESSAGES) and
 * its spend row, when one was written (spec 2026-10-17 R11). Only a row
 * still RUNNING changes (markReviewFailed): one already finished, or already
 * marked stale by a later start (lib/review/start.ts), keeps its outcome.
 * Never throws, like recordAiUsage: it runs on the job's failure path.
 */
export async function failReview(reviewId: string, error: string, aiUsageId: string | null): Promise<void> {
  try {
    await markReviewFailed(reviewId, error, { aiUsageId });
  } catch {
    // Never forward the caught error: a DB driver error can carry connection detail.
    await reportError(new Error("Review not marked failed"), { route: "review", source: "server" });
  }
}
