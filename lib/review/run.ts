import "server-only";
import { isAiConfigured } from "@/lib/ai";
import { recordAiUsage } from "@/lib/ai-usage";
import { db } from "@/lib/db";
import { reportError } from "@/lib/error-sink";
import { saveReviewResult } from "@/lib/review-store";
import { callReviewModel, REVIEW_RUN_BUDGET_MS, type ReviewCallOutcome } from "./call";
import { failReview } from "./fail";
import { flagsToFindings } from "./from-flags";
import { buildReviewInput } from "./input";
import { REVIEW_MESSAGES as M } from "./messages";
import { MAX_MODEL_FINDINGS, mergeDrafts, reviewSummary, toFindingDrafts } from "./model-output";
import type { ReviewKind } from "./types";

const ROUTE = "review";
const USAGE_ROUTE = "review#usage";

const FAILURES: Record<Exclude<ReviewCallOutcome["kind"], "ok">, { reason: string; outcome: "api_error" | "unreadable" | "timed_out" }> = {
  busy: { reason: M.busy, outcome: "api_error" },
  api_error: { reason: M.failed, outcome: "api_error" },
  unreadable: { reason: M.unreadable, outcome: "unreadable" },
  timeout: { reason: M.timeout, outcome: "timed_out" },
};

/**
 * The Review job (spec 2026-10-17 R8, R11), run by startReview in
 * next/server after(), once its RUNNING row is committed. A system job: it
 * reads no session and never calls requireUser (it runs after the response,
 * and after() carries over whatever request context the start had), and it
 * writes no Activity. It acts for the row's starter. It reads the plan as
 * everyone sees it, asks Claude, writes one AiUsage row for any call made,
 * and ends the row DONE (saveReviewResult, which matches the previous
 * Review's Findings, R10) or FAILED with a reason. Never throws: after() has
 * no one to tell.
 */
export async function runReview(reviewId: string): Promise<void> {
  const started = Date.now();
  let userId: string | undefined;
  let aiUsageId: string | null = null;
  try {
    const review = await db.review.findUnique({
      where: { id: reviewId },
      select: { tripId: true, startedById: true, kind: true, model: true, status: true },
    });
    if (!review || review.status !== "RUNNING") return;
    if (!isAiConfigured()) {
      await failReview(reviewId, M.notSetUp, null);
      return;
    }
    // The starter's account was deleted (SetNull) between the start and the job: no one to bill.
    if (!review.startedById) {
      await failReview(reviewId, M.failed, null);
      return;
    }
    const starterId = review.startedById;
    userId = starterId;

    const input = await buildReviewInput(review.tripId);
    const outcome = await callReviewModel({
      kind: review.kind as ReviewKind,
      model: review.model,
      input,
      deadline: started + REVIEW_RUN_BUDGET_MS,
    });
    // The spend row first, straight after the call: a throw while the reply
    // is cleaned and merged below must never lose what was billed. Its id is
    // linked when the Review is saved or failed. proposalCount: the Findings
    // Claude returned, up to the cap toFindingDrafts keeps.
    aiUsageId = await recordAiUsage({
      tripId: review.tripId, userId: starterId, model: review.model,
      usage: outcome.usage, durationMs: Date.now() - started, route: USAGE_ROUTE,
      proposalCount: outcome.kind === "ok" ? Math.min(outcome.output.findings.length, MAX_MODEL_FINDINGS) : 0,
      outcome: outcome.kind === "ok" ? "ok" : FAILURES[outcome.kind].outcome,
    });

    if (outcome.kind !== "ok") {
      const failure = FAILURES[outcome.kind];
      if (outcome.kind === "api_error") {
        await reportError(new Error(`Review: Anthropic API error ${outcome.status ?? "unknown"}`), { route: ROUTE, source: "server", userId });
      }
      if (outcome.kind === "unreadable") await reportError(outcome.report, { route: ROUTE, source: "server", userId });
      await failReview(reviewId, failure.reason, aiUsageId);
      return;
    }

    const drafts = mergeDrafts(flagsToFindings(input.flags), toFindingDrafts(outcome.output, input.targets));
    const { saved } = await saveReviewResult(reviewId, drafts, { summary: reviewSummary(outcome.output, drafts.length), aiUsageId });
    // Refused: the row went stale (it already reads as FAILED) or another writer ended it.
    // failReview only moves a row still RUNNING, so this just links the spend to a stale one.
    if (!saved) await failReview(reviewId, M.stale, aiUsageId);
  } catch (err) {
    // Never forward the thrown value: a DB or parse error can carry plan text.
    const name = err instanceof Error ? err.name : "unknown";
    await failReview(reviewId, M.failed, aiUsageId);
    try {
      await reportError(new Error(`Review job failed (${name})`), { route: ROUTE, source: "server", userId });
    } catch {
      // reportError doesn't throw; nothing is left to tell if it did.
    }
  }
}
