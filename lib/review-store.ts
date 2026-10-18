/**
 * Writing a Review's outcome (spec 2026-10-17 R10, R11). The background run
 * (lib/review/run.ts) calls saveReviewResult with the restated Flags and the
 * model's Findings, or markReviewFailed. Both only ever move a RUNNING row,
 * so a run that finishes after it was marked FAILED writes nothing; nor does
 * saveReviewResult save a RUNNING row already past REVIEW_STALE_AFTER_MS (it
 * reads as FAILED).
 */
import { db } from "@/lib/db";
import { matchFindings, type PreviousFinding } from "@/lib/review/match";
import { serializeSuggestedFix } from "@/lib/review/schema";
import { effectiveReviewStatus, type FindingDraft, type FindingState } from "@/lib/review/types";

const MAX_ERROR = 500;

export async function saveReviewResult(
  reviewId: string,
  drafts: readonly FindingDraft[],
  meta: { summary: string; aiUsageId?: string | null; now?: Date },
): Promise<{ saved: boolean; findingCount: number }> {
  const now = meta.now ?? new Date();
  return db.$transaction(async (tx) => {
    // Lock the row so a concurrent markReviewFailed (or a second save) waits and then sees DONE.
    const [locked] = await tx.$queryRaw<{ tripId: string; status: string; startedAt: Date }[]>`
      SELECT "tripId", "status", "startedAt" FROM "Review" WHERE "id" = ${reviewId} FOR UPDATE`;
    if (!locked || locked.status !== "RUNNING") return { saved: false, findingCount: 0 };
    // A stale run already reads as FAILED everywhere (effectiveReviewStatus): a late finish
    // must not flip it to DONE behind the UI's back.
    if (effectiveReviewStatus("RUNNING", locked.startedAt, now) !== "RUNNING") return { saved: false, findingCount: 0 };

    const previousReview = await tx.review.findFirst({
      where: { tripId: locked.tripId, status: "DONE", id: { not: reviewId } },
      orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    const previous: PreviousFinding[] = previousReview
      ? (
          await tx.finding.findMany({
            where: { reviewId: previousReview.id },
            orderBy: { position: "asc" },
            select: { id: true, key: true, title: true, state: true, stateById: true, stateAt: true, firstFoundAt: true },
          })
        ).map((f) => ({ ...f, state: f.state as FindingState }))
      : [];

    const { findings, goneIds } = matchFindings(previous, drafts);
    if (findings.length > 0) {
      await tx.finding.createMany({
        data: findings.map((m, position) => ({
          reviewId,
          tripId: locked.tripId,
          key: m.key,
          position,
          severity: m.draft.severity,
          category: m.draft.category,
          targetType: m.draft.targetType,
          targetId: m.draft.targetId ?? null,
          date: m.draft.date ?? null,
          title: m.draft.title,
          detail: m.draft.detail,
          suggestedFix: serializeSuggestedFix(m.draft.suggestedFix),
          source: m.draft.source ?? null,
          origin: m.draft.origin,
          state: m.state,
          stateById: m.stateById,
          stateAt: m.stateAt,
          previousId: m.previousId,
          firstFoundAt: m.firstFoundAt ?? now,
        })),
      });
    }
    if (goneIds.length > 0) {
      await tx.finding.updateMany({ where: { id: { in: goneIds }, state: "OPEN" }, data: { state: "GONE", stateById: null, stateAt: now } });
    }
    await tx.review.update({
      where: { id: reviewId },
      data: { status: "DONE", summary: meta.summary, finishedAt: now, aiUsageId: meta.aiUsageId ?? null },
    });
    return { saved: true, findingCount: findings.length };
  });
}

/**
 * RUNNING → FAILED with a plain-words reason and, when the run spent anything,
 * its AiUsage row; false when the row was not RUNNING.
 */
export async function markReviewFailed(
  reviewId: string,
  error: string,
  opts: { now?: Date; aiUsageId?: string | null } = {},
): Promise<boolean> {
  const { count } = await db.review.updateMany({
    where: { id: reviewId, status: "RUNNING" },
    data: {
      status: "FAILED",
      error: error.slice(0, MAX_ERROR),
      finishedAt: opts.now ?? new Date(),
      ...(opts.aiUsageId !== undefined ? { aiUsageId: opts.aiUsageId } : {}),
    },
  });
  return count === 1;
}
