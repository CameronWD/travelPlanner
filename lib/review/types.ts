/**
 * CONTEXT.md "Review" and "Finding" (spec 2026-10-17 R8–R11): the plain
 * values and types. Zod-free, like lib/enum-values.ts, so client components
 * can import the labels (lib/client-zod.guard.test.ts); the zod schema for a
 * suggested fix is lib/review/schema.ts. Stored as plain String columns
 * (prisma/schema.prisma Review, Finding).
 */
import type { BookingState } from "@/lib/enum-values";
import type { OpeningHours } from "@/lib/opening-hours";
import { REVIEW_STALE_AFTER_MS } from "@/lib/review-permission";

/** `Review.kind` (R11). */
export const REVIEW_KINDS = ["STANDARD", "DEEP"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export const REVIEW_KIND_LABELS: Record<ReviewKind, string> = { STANDARD: "Standard Review", DEEP: "Deep Review" };

/** `Review.status`. A RUNNING row past REVIEW_STALE_AFTER_MS reads as FAILED (effectiveReviewStatus). */
const REVIEW_STATUSES = ["RUNNING", "DONE", "FAILED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** `Finding.severity`: the Flag scale (lib/flags.ts). */
export const FINDING_SEVERITIES = ["warning", "info"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/** `Finding.category` (R8). */
export const FINDING_CATEGORIES = ["CLOSURE", "SEASON", "TICKET", "HOLIDAY", "LOGISTICS", "STALE_NOTE", "PACKING", "BOOKING"] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export const FINDING_CATEGORY_LABELS: Record<FindingCategory, string> = {
  CLOSURE: "Closure",
  SEASON: "Season",
  TICKET: "Tickets",
  HOLIDAY: "Public holiday",
  LOGISTICS: "Logistics",
  STALE_NOTE: "Stale note",
  PACKING: "Packing",
  BOOKING: "Booking",
};

/** `Finding.state` (R10). GONE: a later Review no longer raised it. */
export const FINDING_STATES = ["OPEN", "APPLIED", "DISMISSED", "GONE"] as const;
export type FindingState = (typeof FINDING_STATES)[number];
export const FINDING_STATE_LABELS: Record<FindingState, string> = {
  OPEN: "Open",
  APPLIED: "Applied",
  DISMISSED: "Dismissed",
  GONE: "No longer found",
};

/**
 * A Finding's state as shown (spec 2026-10-18 A4): the stored state, or
 * FIXED for an Open restated Flag that no longer fires. Derived at read time
 * from the live Flags (lib/review/fixed.ts), never stored.
 */
export type FindingShownState = FindingState | "FIXED";
export const FINDING_SHOWN_STATE_LABELS: Record<FindingShownState, string> = { ...FINDING_STATE_LABELS, FIXED: "Fixed in the plan" };

/** `Finding.origin`: a Flag restated (R8), or the model's own check. */
export const FINDING_ORIGINS = ["FLAG", "MODEL"] as const;
export type FindingOrigin = (typeof FINDING_ORIGINS)[number];

/** `Finding.targetType`: the Flag targets (lib/flags.ts FlagTargetType). */
export const FINDING_TARGET_TYPES = ["STOP", "ITEM", "TRANSPORT", "ACCOMMODATION", "DAY", "TRIP"] as const;
export type FindingTargetType = (typeof FINDING_TARGET_TYPES)[number];

/** The lists a checklist fix may add to (CONTEXT.md Checklist): never Shopping. */
export const CHECKLIST_FIX_LISTS = ["PACKING", "PRETRIP"] as const;
export type ChecklistFixList = (typeof CHECKLIST_FIX_LISTS)[number];

/**
 * A fix that maps onto an existing action (R8 "Apply"). Validated by
 * lib/review/schema.ts suggestedFixSchema; applied by server/actions/reviews.ts.
 * Optional keys are left alone; `null` clears (the PATCH contract, ADR 0075).
 * Every kind but `checklist.add` changes its Finding's own row (lib/review/fix.ts
 * RowFix); `checklist.add` adds to a Checklist instead.
 */
export type SuggestedFix =
  | { kind: "item.times"; itemId: string; startTime?: string | null; endTime?: string | null; date?: string }
  | { kind: "item.bookingState"; id: string; bookingState: BookingState; bookBy?: string | null }
  | { kind: "transport.bookingState"; id: string; bookingState: BookingState; bookBy?: string | null }
  | { kind: "accommodation.bookingState"; id: string; bookingState: BookingState; bookBy?: string | null }
  | { kind: "item.openingHours"; itemId: string; hours: OpeningHours }
  | { kind: "item.note"; itemId: string; append: string }
  | { kind: "checklist.add"; list: ChecklistFixList; text: string };

/** A `checklist.add` fix, narrowed out of SuggestedFix. */
export type ChecklistFix = Extract<SuggestedFix, { kind: "checklist.add" }>;

/** A fix that changes one row of the plan (everything but checklist.add). */
export type RowFix = Exclude<SuggestedFix, { kind: "checklist.add" }>;

export function isChecklistFix(fix: SuggestedFix): fix is ChecklistFix {
  return fix.kind === "checklist.add";
}

/** One Finding before it is stored: a restated Flag (lib/review/from-flags.ts) or the model's. */
export interface FindingDraft {
  severity: FindingSeverity;
  category: FindingCategory;
  targetType: FindingTargetType;
  targetId?: string;
  /** YYYY-MM-DD: a DAY target's day, or the day the Finding is about. */
  date?: string;
  title: string;
  detail: string;
  suggestedFix?: SuggestedFix;
  /** A URL the Finding came from. */
  source?: string;
  origin: FindingOrigin;
  /** A restated Flag's own id (lib/flags.ts), so it matches itself across Reviews (lib/review/key.ts). */
  flagId?: string;
  /**
   * A restated Flag's own target, when the Finding is about something else
   * (a retimed tight connection is about the later Item, spec 2026-10-18 A3).
   * The key uses this, so the retarget never breaks history. Not stored.
   */
  flagTarget?: { targetType: FindingTargetType; targetId?: string };
}

/**
 * A RUNNING Review older than this died without saying so (decision 3).
 * Defined once in lib/review-permission.ts; re-exported here for convenience.
 */
export { REVIEW_STALE_AFTER_MS };

/**
 * Who started a Review, or Applied or Dismissed a Finding, once that account
 * is deleted (Review.startedById and Finding.stateById are SetNull).
 * Lower-case: it reads mid-sentence ("Started by a former Traveller").
 */
export const FORMER_TRAVELLER_NAME = "a former Traveller";

/** What a stale run shows in place of an error. */
export const REVIEW_STALE_ERROR = "This Review stopped before it finished.";

/** The status to show and to act on: a stale RUNNING row is FAILED, so it never blocks the Trip. */
export function effectiveReviewStatus(status: ReviewStatus, startedAt: Date, now: Date): ReviewStatus {
  if (status === "RUNNING" && now.getTime() - startedAt.getTime() >= REVIEW_STALE_AFTER_MS) return "FAILED";
  return status;
}
