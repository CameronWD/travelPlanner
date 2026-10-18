import "server-only";
import { db } from "@/lib/db";
import { REVIEW_STALE_AFTER_MS } from "@/lib/review-permission";
import { loadReviewStanding } from "@/lib/review-permission-reads";
import { REVIEW_MESSAGES } from "./messages";
import type { ReviewKind } from "./types";

export type BeginReviewResult =
  | { kind: "started"; reviewId: string }
  | { kind: "off" }
  | { kind: "limit"; nextAvailableAt: Date | null }
  /** startedById is null once the running Review's starter deleted their account. */
  | { kind: "running"; startedById: string | null };

/**
 * Start a Review if the starter may (spec 2026-10-17 R12): their permission
 * isn't Off, a Limited account is under its limits, and no Review runs on
 * the Trip. All of it, and the RUNNING insert, happens in one transaction
 * under row locks, so two starts can't both pass.
 *
 * The User row is locked because the limits are per account, across Trips;
 * the Trip row because only one Review may run on it. Always in that order,
 * so starts never deadlock. The User lock is FOR UPDATE, the mode
 * loadReviewStanding takes, so its re-lock below is no upgrade. The Trip's
 * is NO KEY UPDATE, which leaves other writers' foreign-key share locks on
 * the Trip unblocked while two starts still serialise.
 *
 * Inside the locks a RUNNING row past REVIEW_STALE_AFTER_MS (a job the
 * platform killed) on this Trip or by this account is marked FAILED first,
 * so it neither blocks nor counts. Raw SQL because Prisma can't express
 * SELECT … FOR UPDATE.
 */
export async function beginReview(userId: string, tripId: string, kind: ReviewKind, model: string, now: Date = new Date()): Promise<BeginReviewResult> {
  return db.$transaction(async (tx): Promise<BeginReviewResult> => {
    // A theoretical deadlock, noted, not fixed (docs/open-follow-ups.md): a
    // saveReviewResult (lib/review-store.ts) holding its Review row FOR UPDATE
    // can insert a Finding whose stateById (a carried Dismissal) is this User,
    // which needs a KEY SHARE lock this FOR UPDATE blocks, while this start,
    // below, waits on that same Review row to mark it stale. Only a save that
    // passed its own stale check just as the row turned stale can meet it
    // (a save of a row already stale refuses before inserting anything).
    // Postgres detects the cycle (40P01) and aborts one transaction: the
    // start returns an error to retry, or the job ends the Review FAILED.
    // Neither leaves bad data.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id" = ${tripId} FOR NO KEY UPDATE`;

    // lte: a row exactly REVIEW_STALE_AFTER_MS old already reads as FAILED (effectiveReviewStatus).
    await tx.review.updateMany({
      where: { status: "RUNNING", startedAt: { lte: new Date(now.getTime() - REVIEW_STALE_AFTER_MS) }, OR: [{ tripId }, { startedById: userId }] },
      data: { status: "FAILED", error: REVIEW_MESSAGES.stale, finishedAt: now },
    });

    const standing = await loadReviewStanding(userId, { now, client: tx, forUpdate: true });
    if (standing.permission === "OFF") return { kind: "off" };
    if (!standing.canRun) return { kind: "limit", nextAvailableAt: standing.nextAvailableAt };

    const running = await tx.review.findFirst({ where: { tripId, status: "RUNNING" }, select: { startedById: true } });
    if (running) return { kind: "running", startedById: running.startedById };

    const review = await tx.review.create({
      data: { tripId, startedById: userId, kind, model, status: "RUNNING", startedAt: now },
      select: { id: true },
    });
    return { kind: "started", reviewId: review.id };
  });
}
