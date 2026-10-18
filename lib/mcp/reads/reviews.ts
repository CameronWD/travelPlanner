/**
 * Reviews as the Claude connection reads them (spec 2026-10-17 R8-R10, R13):
 * list_reviews, get_review, and review_trip's read-back.
 *
 * A thin, Claude-shaped view over R's own reads (lib/review-reads.ts
 * listReviews and getReview), not a parallel query. Those already do what
 * Claude must get too: requireTripAccess first (a missing Review and another
 * Trip's Review both read as notFound()), the effective status (a stale
 * RUNNING row is FAILED with REVIEW_STALE_ERROR, so Claude stops polling a
 * dead run), "a former Traveller" for a deleted account, and the Surprise
 * rule (ADR 0051/0072): a Finding whose target a Surprise now hides from the
 * caller is dropped from the list and the counts, and a fix aimed at a
 * hidden row is withheld (toFindingView). requireUser resolves to the acting
 * Traveller inside /api/mcp, so R's reads run unchanged as the caller.
 *
 * Same words as review_trip: `depth` is "standard" | "deep" (lib/mcp/vocab.ts),
 * and a Finding's target.type is the word set_booking_state's `kind` takes.
 * `fixWith` names the tool Claude would make the suggested change with.
 */
import { getReview, listReviews, type FindingView, type ReviewSummary } from "@/lib/review-reads";
import type {
  FindingCategory, FindingOrigin, FindingSeverity, FindingState, FindingTargetType, ReviewStatus, SuggestedFix,
} from "@/lib/review/types";
import { DEPTH_OF_REVIEW_KIND, FIX_WITH_TOOL, type ReviewDepth } from "../vocab";

export interface McpFinding {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  state: FindingState;
  /** Who Applied or Dismissed it, by name ("a former Traveller" once their account is gone). */
  stateBy: string | null;
  stateAt: string | null;
  target: { type: FindingTargetType; id: string | null };
  date: string | null;
  title: string;
  detail: string;
  suggestedFix: SuggestedFix | null;
  fixWith: string | null;
  source: string | null;
  origin: FindingOrigin;
}

export interface McpReviewSummary {
  id: string;
  tripId: string;
  depth: ReviewDepth;
  status: ReviewStatus;
  startedBy: string;
  startedAt: string;
  finishedAt: string | null;
  summary: string | null;
  error: string | null;
  /** Open Findings the caller can see. */
  openFindings: number;
}

export interface McpReview extends McpReviewSummary {
  model: string;
  findings: McpFinding[];
}

function toSummary(r: ReviewSummary): McpReviewSummary {
  return {
    id: r.id,
    tripId: r.tripId,
    depth: DEPTH_OF_REVIEW_KIND[r.kind],
    status: r.status,
    startedBy: r.startedBy.name,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    summary: r.summary,
    error: r.error,
    openFindings: r.openCount,
  };
}

function toFinding(f: FindingView): McpFinding {
  return {
    id: f.id,
    severity: f.severity,
    category: f.category,
    state: f.state,
    stateBy: f.stateBy?.name ?? null,
    stateAt: f.stateAt?.toISOString() ?? null,
    target: { type: f.targetType, id: f.targetId },
    date: f.date,
    title: f.title,
    detail: f.detail,
    suggestedFix: f.suggestedFix,
    fixWith: f.suggestedFix ? FIX_WITH_TOOL[f.suggestedFix.kind] : null,
    source: f.source,
    origin: f.origin,
  };
}

/** The Trip's Reviews, newest first (R's history list). */
export async function loadReviewsForMcp(tripId: string): Promise<{ reviews: McpReviewSummary[] }> {
  return { reviews: (await listReviews(tripId)).map(toSummary) };
}

/** One Review with the Findings the caller can see: warnings first, then the order the Review raised them. */
export async function loadReviewForMcp(reviewId: string): Promise<McpReview> {
  const r = await getReview(reviewId);
  return { ...toSummary(r), model: r.model, findings: r.findings.map(toFinding) };
}
