/**
 * Reading Reviews (spec 2026-10-17 R9, R10). Open to everyone on the Trip:
 * requireTripAccess is the first check of every read. A Review read the Trip
 * with every Surprise masked when it ran (R9), but a Surprise made since can
 * hide a Finding's target from this viewer, so a Finding whose target is in
 * the viewer's hiddenTargetIds is dropped from every read and count, and
 * requireFindingAccess treats it as missing (ADR 0072). Statuses are
 * effective: a stale RUNNING row reads FAILED (lib/review/types.ts).
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import { TRAVELLER_SELECT, travellerName, type TravellerLike } from "@/lib/traveller";
import { parseSuggestedFix } from "@/lib/review/schema";
import {
  effectiveReviewStatus,
  FORMER_TRAVELLER_NAME,
  REVIEW_STALE_ERROR,
  REVIEW_STALE_AFTER_MS,
  type FindingCategory,
  type FindingOrigin,
  type FindingSeverity,
  type FindingState,
  type FindingTargetType,
  type ReviewKind,
  type ReviewStatus,
  type SuggestedFix,
} from "@/lib/review/types";

/** `id` null: the account is gone, and `name` is FORMER_TRAVELLER_NAME. */
export interface TravellerRef {
  id: string | null;
  name: string;
}

export interface ReviewSummary {
  id: string;
  tripId: string;
  kind: ReviewKind;
  model: string;
  /** Effective: a stale RUNNING row is FAILED. */
  status: ReviewStatus;
  summary: string | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  startedBy: TravellerRef;
  /** Of the Findings this viewer can see. */
  openCount: number;
  findingCount: number;
}

export interface FindingView {
  id: string;
  reviewId: string;
  severity: FindingSeverity;
  category: FindingCategory;
  targetType: FindingTargetType;
  targetId: string | null;
  date: string | null;
  title: string;
  detail: string;
  suggestedFix: SuggestedFix | null;
  source: string | null;
  origin: FindingOrigin;
  state: FindingState;
  stateBy: TravellerRef | null;
  stateAt: Date | null;
  firstFoundAt: Date;
  canApply: boolean;
  canDismiss: boolean;
  canUndo: boolean;
}

export interface ReviewDetail extends ReviewSummary {
  /** Warnings first, then the order the Review raised them. */
  findings: FindingView[];
}

export interface FindingAccess {
  user: { id: string };
  finding: {
    id: string;
    reviewId: string;
    tripId: string;
    state: FindingState;
    suggestedFix: string | null;
    undoPayload: string | null;
    stateById: string | null;
    stateAt: Date | null;
  };
  /** Its Review is the Trip's latest DONE Review (decision 6: only that one's Findings Apply or Dismiss). */
  isLatest: boolean;
}

const HISTORY_LIMIT = 50;
const SEVERITY_ORDER: Record<FindingSeverity, number> = { warning: 0, info: 1 };

const REVIEW_SELECT = {
  id: true, tripId: true, kind: true, model: true, status: true, summary: true, error: true,
  startedAt: true, finishedAt: true, startedBy: { select: TRAVELLER_SELECT },
} as const;

type ReviewRow = {
  id: string; tripId: string; kind: string; model: string; status: string; summary: string | null; error: string | null;
  startedAt: Date; finishedAt: Date | null; startedBy: TravellerLike | null;
};

const FINDING_SELECT = {
  id: true, reviewId: true, severity: true, category: true, targetType: true, targetId: true, date: true,
  title: true, detail: true, suggestedFix: true, source: true, origin: true, state: true, stateAt: true,
  undoPayload: true, firstFoundAt: true, stateBy: { select: TRAVELLER_SELECT },
} as const;

type FindingRow = {
  id: string; reviewId: string; severity: string; category: string; targetType: string; targetId: string | null;
  date: string | null; title: string; detail: string; suggestedFix: string | null; source: string | null;
  origin: string; state: string; stateAt: Date | null; undoPayload: string | null; firstFoundAt: Date;
  stateBy: TravellerLike | null;
};

/** Findings whose target the viewer may see. A bare NOT IN would also drop every null target (DAY, TRIP). */
function visibleFindings(hiddenTargetIds: readonly string[]) {
  return hiddenTargetIds.length === 0 ? {} : { OR: [{ targetId: null }, { targetId: { notIn: [...hiddenTargetIds] } }] };
}

const FORMER: TravellerRef = { id: null, name: FORMER_TRAVELLER_NAME };
const ref = (u: TravellerLike | null): TravellerRef => (u ? { id: u.id, name: travellerName(u) } : FORMER);

async function latestDoneReviewId(tripId: string): Promise<string | null> {
  const r = await db.review.findFirst({ where: { tripId, status: "DONE" }, orderBy: [{ finishedAt: "desc" }, { id: "desc" }], select: { id: true } });
  return r?.id ?? null;
}

function toSummary(row: ReviewRow, counts: { open: number; total: number }, now: Date): ReviewSummary {
  const status = effectiveReviewStatus(row.status as ReviewStatus, row.startedAt, now);
  const stale = status === "FAILED" && row.status === "RUNNING";
  return {
    id: row.id,
    tripId: row.tripId,
    kind: row.kind as ReviewKind,
    model: row.model,
    status,
    summary: row.summary,
    error: stale ? REVIEW_STALE_ERROR : row.error,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    startedBy: ref(row.startedBy),
    openCount: counts.open,
    findingCount: counts.total,
  };
}

function toFindingView(f: FindingRow, onLatest: boolean): FindingView {
  const state = f.state as FindingState;
  const suggestedFix = parseSuggestedFix(f.suggestedFix);
  return {
    id: f.id,
    reviewId: f.reviewId,
    severity: f.severity as FindingSeverity,
    category: f.category as FindingCategory,
    targetType: f.targetType as FindingTargetType,
    targetId: f.targetId,
    date: f.date,
    title: f.title,
    detail: f.detail,
    suggestedFix,
    source: f.source,
    origin: f.origin as FindingOrigin,
    state,
    // Applied or Dismissed by an account since deleted (stateById SetNull) still says it was someone.
    stateBy: f.stateBy ? ref(f.stateBy) : state === "APPLIED" || state === "DISMISSED" ? FORMER : null,
    stateAt: f.stateAt,
    firstFoundAt: f.firstFoundAt,
    canApply: onLatest && state === "OPEN" && suggestedFix !== null,
    canDismiss: onLatest && state === "OPEN",
    canUndo: state === "DISMISSED" || (state === "APPLIED" && f.undoPayload !== null),
  };
}

async function reviewDetail(row: ReviewRow, hiddenTargetIds: readonly string[], latestId: string | null, now: Date): Promise<ReviewDetail> {
  const rows = await db.finding.findMany({
    where: { reviewId: row.id, ...visibleFindings(hiddenTargetIds) },
    orderBy: { position: "asc" },
    select: FINDING_SELECT,
  });
  const findings = rows
    .map((f) => toFindingView(f, row.id === latestId))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]); // stable: keeps `position` within a severity
  return { ...toSummary(row, { open: findings.filter((f) => f.state === "OPEN").length, total: findings.length }, now), findings };
}

/** The Trip's latest DONE Review with its Findings, or null before the first one finishes. */
export async function latestReview(tripId: string): Promise<ReviewDetail | null> {
  const { user } = await requireTripAccess(tripId);
  const row = await db.review.findFirst({
    where: { tripId, status: "DONE" },
    orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
    select: REVIEW_SELECT,
  });
  if (!row) return null;
  const v = await loadSurpriseVisibility(tripId, user.id);
  return reviewDetail(row, v.hiddenTargetIds, row.id, new Date());
}

/** One Review with its Findings (the history list's "open one"; MCP get_review). */
export async function getReview(reviewId: string): Promise<ReviewDetail> {
  const row = await db.review.findUnique({ where: { id: reviewId }, select: REVIEW_SELECT });
  if (!row) notFound();
  const { user } = await requireTripAccess(row.tripId);
  const [v, latestId] = await Promise.all([loadSurpriseVisibility(row.tripId, user.id), latestDoneReviewId(row.tripId)]);
  return reviewDetail(row, v.hiddenTargetIds, latestId, new Date());
}

/** Every Review of the Trip, newest first (R10 history: who, when, kind, summary line). */
export async function listReviews(tripId: string): Promise<ReviewSummary[]> {
  const { user } = await requireTripAccess(tripId);
  const rows = await db.review.findMany({
    where: { tripId },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: HISTORY_LIMIT,
    select: REVIEW_SELECT,
  });
  if (rows.length === 0) return [];
  const v = await loadSurpriseVisibility(tripId, user.id);
  const counts = await db.finding.groupBy({
    by: ["reviewId", "state"],
    where: { reviewId: { in: rows.map((r) => r.id) }, ...visibleFindings(v.hiddenTargetIds) },
    _count: { _all: true },
  });
  const now = new Date();
  return rows.map((r) => {
    const mine = counts.filter((c) => c.reviewId === r.id);
    return toSummary(r, {
      open: mine.filter((c) => c.state === "OPEN").reduce((n, c) => n + c._count._all, 0),
      total: mine.reduce((n, c) => n + c._count._all, 0),
    }, now);
  });
}

/** The Review running on this Trip now, if any. A stale run is not running. */
export async function runningReview(tripId: string): Promise<ReviewSummary | null> {
  await requireTripAccess(tripId);
  const now = new Date();
  const row = await db.review.findFirst({
    where: { tripId, status: "RUNNING", startedAt: { gt: new Date(now.getTime() - REVIEW_STALE_AFTER_MS) } },
    orderBy: { startedAt: "desc" },
    select: REVIEW_SELECT,
  });
  return row ? toSummary(row, { open: 0, total: 0 }, now) : null;
}

/**
 * The guard for Apply, Dismiss and Undo (server/actions/reviews.ts): the
 * Finding exists, the viewer is on its Trip, and its target is not hidden
 * from them. notFound() otherwise, as for a row that doesn't exist.
 */
export async function requireFindingAccess(findingId: string): Promise<FindingAccess> {
  const row = await db.finding.findUnique({
    where: { id: findingId },
    select: { id: true, reviewId: true, tripId: true, targetId: true, state: true, suggestedFix: true, undoPayload: true, stateById: true, stateAt: true },
  });
  if (!row) notFound();
  const { user } = await requireTripAccess(row.tripId);
  if (row.targetId) {
    const v = await loadSurpriseVisibility(row.tripId, user.id);
    if (v.hiddenTargetIds.includes(row.targetId)) notFound();
  }
  const latestId = await latestDoneReviewId(row.tripId);
  return {
    user: { id: user.id },
    finding: {
      id: row.id,
      reviewId: row.reviewId,
      tripId: row.tripId,
      state: row.state as FindingState,
      suggestedFix: row.suggestedFix,
      undoPayload: row.undoPayload,
      stateById: row.stateById,
      stateAt: row.stateAt,
    },
    isLatest: row.reviewId === latestId,
  };
}
