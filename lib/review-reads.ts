/**
 * Reading Reviews (spec 2026-10-17 R9, R10). Open to everyone on the Trip:
 * requireTripAccess is the first check of every read. A Review read the Trip
 * with every Surprise masked when it ran (R9), but a Surprise made since can
 * hide a Finding's target from this viewer, so a Finding whose target is in
 * the viewer's hiddenTargetIds is dropped from every read and count, and
 * requireFindingAccess treats it as missing (ADR 0072). Statuses are
 * effective: a stale RUNNING row reads FAILED (lib/review/types.ts).
 *
 * A Finding's state is the shown one (spec 2026-10-18 A4): an Open restated
 * Flag whose Flag no longer fires reads FIXED, "Fixed in the plan". It is
 * derived here from the live Flags (lib/review/live-flags.ts), never stored,
 * so the Reviews tab, Home's line, the history and Claude all agree, and it
 * turns back to Open the moment the Flag returns. Every open count counts the
 * shown OPEN. A Trip without dates has no Flags (null, unknown), so none of
 * its Findings reads FIXED. Saving and matching (lib/review/run.ts) keep
 * reading the stored state.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { Flag } from "@/lib/flags";
import { requireTripAccess } from "@/lib/guards";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import { TRAVELLER_SELECT, travellerName, type TravellerLike } from "@/lib/traveller";
import { parseSuggestedFix } from "@/lib/review/schema";
import { fixFitsTarget, fixTarget, isStrandedApply } from "@/lib/review/fix";
import { offeredFix, shownState } from "@/lib/review/fixed";
import { loadLiveFlags } from "@/lib/review/live-flags";
import {
  effectiveReviewStatus,
  FORMER_TRAVELLER_NAME,
  isChecklistFix,
  REVIEW_STALE_ERROR,
  REVIEW_STALE_AFTER_MS,
  type FindingCategory,
  type FindingOrigin,
  type FindingSeverity,
  type FindingShownState,
  type FindingState,
  type FindingTargetType,
  type ReviewKind,
  type ReviewStatus,
  type SuggestedFix,
} from "@/lib/review/types";

/** `id` null: the account is gone, and `name` is FORMER_TRAVELLER_NAME. */
interface TravellerRef {
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
  /** Shown (spec 2026-10-18 A4): FIXED for an Open restated Flag that no longer fires. */
  state: FindingShownState;
  /** An Open restated Flag's Flag as it fires now; null otherwise. */
  liveFlag: Flag | null;
  stateBy: TravellerRef | null;
  stateAt: Date | null;
  firstFoundAt: Date;
  /** Shown OPEN, has a fix this viewer may see, on the latest DONE Review. */
  canApply: boolean;
  /** Shown OPEN, on the latest DONE Review. */
  canDismiss: boolean;
  /** DISMISSED on the latest DONE Review; or APPLIED with its payload saved (any Review), or stranded (released). Never FIXED: the app changed nothing. */
  canUndo: boolean;
  /** An item.openingHours fix on an Item that already has hours: Apply replaces them (final wave M6). */
  replacesHours: boolean;
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
    targetType: FindingTargetType;
    targetId: string | null;
    /** With `key`, how Apply and Dismiss tell an Open restated Flag that reads Fixed in the plan now (A4). */
    origin: FindingOrigin;
    key: string;
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
  key: true, title: true, detail: true, suggestedFix: true, source: true, origin: true, state: true, stateAt: true,
  undoPayload: true, firstFoundAt: true, stateBy: { select: TRAVELLER_SELECT },
} as const;

type FindingRow = {
  id: string; reviewId: string; severity: string; category: string; targetType: string; targetId: string | null;
  date: string | null; key: string; title: string; detail: string; suggestedFix: string | null; source: string | null;
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

function toFindingView(
  f: FindingRow,
  onLatest: boolean,
  hiddenTargetIds: readonly string[],
  now: Date,
  live: ReadonlyMap<string, Flag> | null,
): FindingView {
  const state = f.state as FindingState;
  const shown = shownState({ origin: f.origin, state, key: f.key }, live);
  const parsed = parseSuggestedFix(f.suggestedFix);
  // A fix only touches the Finding's own row, except a checklist fix (never
  // a row): a stored row fix aimed elsewhere (written before that rule)
  // reads as none, Dismiss only. And a row a Surprise hides from this
  // viewer never leaves the server. A tight connection's stored retime is
  // offered only while its live Flag still proposes it (offeredFix, A3).
  const visibleFix =
    parsed && fixFitsTarget(parsed, f) && !(parsed && !isChecklistFix(parsed) && hiddenTargetIds.includes(fixTarget(parsed).id)) ? parsed : null;
  const suggestedFix = offeredFix(visibleFix, shown.liveFlag);
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
    state: shown.state,
    liveFlag: shown.liveFlag,
    // Applied or Dismissed by an account since deleted (stateById SetNull) still says it was someone.
    stateBy: f.stateBy ? ref(f.stateBy) : state === "APPLIED" || state === "DISMISSED" ? FORMER : null,
    stateAt: f.stateAt,
    firstFoundAt: f.firstFoundAt,
    canApply: onLatest && shown.state === "OPEN" && suggestedFix !== null,
    canDismiss: onLatest && shown.state === "OPEN",
    canUndo:
      shown.state !== "FIXED" &&
      ((onLatest && state === "DISMISSED") ||
        (state === "APPLIED" && (f.undoPayload !== null || isStrandedApply(f, now)))),
    replacesHours: false,
  };
}

/** M6: mark the opening-hours fixes whose Item already has hours, so the fix reads "Replace", not "Add". */
async function markReplacedHours(findings: FindingView[]): Promise<FindingView[]> {
  const itemIds = [...new Set(findings.flatMap((f) => (f.suggestedFix?.kind === "item.openingHours" ? [f.suggestedFix.itemId] : [])))];
  if (itemIds.length === 0) return findings;
  const withHours = new Set(
    (await db.item.findMany({ where: { id: { in: itemIds }, openingHours: { not: null } }, select: { id: true } })).map((i) => i.id),
  );
  return findings.map((f) =>
    f.suggestedFix?.kind === "item.openingHours" && withHours.has(f.suggestedFix.itemId) ? { ...f, replacesHours: true } : f,
  );
}

/** Only an Open restated Flag can read FIXED, so only then are the live Flags worth loading. */
const mayBeFixed = (f: { origin: string; state: string }) => f.origin === "FLAG" && f.state === "OPEN";

async function reviewDetail(row: ReviewRow, hiddenTargetIds: readonly string[], latestId: string | null, now: Date): Promise<ReviewDetail> {
  const rows = await db.finding.findMany({
    where: { reviewId: row.id, ...visibleFindings(hiddenTargetIds) },
    orderBy: { position: "asc" },
    select: FINDING_SELECT,
  });
  const live = rows.some(mayBeFixed) ? await loadLiveFlags(row.tripId) : null;
  const findings = (await markReplacedHours(rows.map((f) => toFindingView(f, row.id === latestId, hiddenTargetIds, now, live))))
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

/**
 * Home's review line (R10, final wave M9): the latest DONE Review's id and
 * start, and how many of its Findings this viewer can see are Open, counted
 * in the database with latestReview's Surprise filter, never loading them.
 */
export async function latestReviewOpenCount(tripId: string): Promise<{ id: string; startedAt: Date; openCount: number } | null> {
  const { user } = await requireTripAccess(tripId);
  const row = await db.review.findFirst({
    where: { tripId, status: "DONE" },
    orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
    select: { id: true, startedAt: true },
  });
  if (!row) return null;
  const v = await loadSurpriseVisibility(tripId, user.id);
  const visible = visibleFindings(v.hiddenTargetIds);
  const [modelOpen, flagOpen] = await Promise.all([
    db.finding.count({ where: { reviewId: row.id, state: "OPEN", origin: "MODEL", ...visible } }),
    db.finding.findMany({ where: { reviewId: row.id, state: "OPEN", origin: "FLAG", ...visible }, select: { key: true } }),
  ]);
  const live = flagOpen.length > 0 ? await loadLiveFlags(tripId) : null;
  const stillOpen = flagOpen.filter((f) => shownState({ origin: "FLAG", state: "OPEN", key: f.key }, live).state === "OPEN").length;
  return { id: row.id, startedAt: row.startedAt, openCount: modelOpen + stillOpen };
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
  const where = { reviewId: { in: rows.map((r) => r.id) }, ...visibleFindings(v.hiddenTargetIds) };
  const [counts, flagOpen] = await Promise.all([
    db.finding.groupBy({ by: ["reviewId", "state"], where, _count: { _all: true } }),
    db.finding.findMany({ where: { ...where, state: "OPEN", origin: "FLAG" }, select: { reviewId: true, key: true } }),
  ]);
  // The stored Open count, less the restated Flags that read FIXED now.
  const live = flagOpen.length > 0 ? await loadLiveFlags(tripId) : null;
  const fixed = flagOpen.filter((f) => shownState({ origin: "FLAG", state: "OPEN", key: f.key }, live).state === "FIXED");
  const now = new Date();
  return rows.map((r) => {
    const mine = counts.filter((c) => c.reviewId === r.id);
    return toSummary(r, {
      open: mine.filter((c) => c.state === "OPEN").reduce((n, c) => n + c._count._all, 0) - fixed.filter((f) => f.reviewId === r.id).length,
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
    select: {
      id: true, reviewId: true, tripId: true, targetType: true, targetId: true, origin: true, key: true, state: true,
      suggestedFix: true, undoPayload: true, stateById: true, stateAt: true,
    },
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
      targetType: row.targetType as FindingTargetType,
      targetId: row.targetId,
      origin: row.origin as FindingOrigin,
      key: row.key,
      state: row.state as FindingState,
      suggestedFix: row.suggestedFix,
      undoPayload: row.undoPayload,
      stateById: row.stateById,
      stateAt: row.stateAt,
    },
    isLatest: row.reviewId === latestId,
  };
}
