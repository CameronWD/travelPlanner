import type { Route } from "next";
import { tripSubPath } from "@/lib/trip-path";
import { shortDate } from "@/lib/time-display";
import type { BookingState } from "@/lib/enum-values";
import {
  FINDING_CATEGORY_LABELS,
  REVIEW_KIND_LABELS,
  type FindingCategory,
  type FindingSeverity,
  type FindingState,
  type FindingTargetType,
  type ReviewKind,
  type ReviewStatus,
  type SuggestedFix,
} from "@/lib/review/types";

/**
 * How a Review and its Findings read on screen (spec 2026-10-17 R10). Pure
 * and React-free: the Reviews page's loader builds serialisable view rows
 * from R's reads with these, and the client components only render them.
 *
 * REVIEW_KIND_LABELS and FINDING_CATEGORY_LABELS are re-exported from
 * lib/review/types.ts rather than redefined here: R already built both
 * (the eight UPPERCASE categories, no "flag" — each Flag restates onto one
 * of the eight, R decision 2), and a second copy here would just be a
 * second place to keep in sync with it.
 */
export { FINDING_CATEGORY_LABELS, REVIEW_KIND_LABELS };

// ---------------------------------------------------------------------------
// Dates. Server-rendered in the Trip's current zone, so they are deterministic.
// ---------------------------------------------------------------------------

function zonedParts(at: Date, timeZone: string): Record<"weekday" | "day" | "month" | "hour" | "minute", string> {
  const format = (tz: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(at);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timeZone);
  } catch {
    parts = format("UTC");
  }
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: get("weekday"), day: get("day"), month: get("month"), hour: get("hour"), minute: get("minute") };
}

/** "18 Oct". */
export function formatReviewDay(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${p.day} ${p.month}`;
}

/** "Sun 18 Oct, 14:05". */
export function formatReviewWhen(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}

// ---------------------------------------------------------------------------
// One Finding
// ---------------------------------------------------------------------------

/**
 * Who started a Review or set a Finding's state: the shape of R's
 * TravellerRef (lib/review-reads.ts), read structurally here rather than
 * imported, so this stays a pure leaf module with no server-only reads in
 * its graph. `id` null is a deleted account; R already resolves `name` to
 * FORMER_TRAVELLER_NAME ("a former Traveller") in that case, so it is
 * shown whole below, never split for a first name (that would read as "a").
 */
export interface TravellerRefLike {
  id: string | null;
  name: string;
}

function firstName(ref: TravellerRefLike): string {
  return ref.id === null ? ref.name : (ref.name.trim().split(/\s+/)[0] ?? ref.name);
}

/** What these helpers read from a Finding row (R's `FindingView` is wider). */
export interface FindingForView {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  targetType: FindingTargetType;
  targetId: string | null;
  date: string | null;
  title: string;
  detail: string;
  suggestedFix: SuggestedFix | null;
  source: string | null;
  state: FindingState;
  stateAt: Date | null;
  stateBy: TravellerRefLike | null;
  /** R's FindingView flags (lib/review-reads.ts): the gating rules live there, not here. */
  canApply: boolean;
  canDismiss: boolean;
  canUndo: boolean;
  /** R's FindingView: an opening-hours fix on an Item that already has hours (final wave M6). */
  replacesHours?: boolean;
}

function byWhen(verb: string, f: Pick<FindingForView, "stateAt" | "stateBy">, timeZone: string): string {
  const who = f.stateBy ? ` by ${firstName(f.stateBy)}` : "";
  const when = f.stateAt ? `, ${formatReviewDay(f.stateAt, timeZone)}` : "";
  return `${verb}${who}${when}`;
}

/** CONTEXT.md "Finding": Open, Applied (by, when), Dismissed (by, when), No longer found. */
export function findingStateLabel(f: Pick<FindingForView, "state" | "stateAt" | "stateBy">, timeZone: string): string {
  switch (f.state) {
    case "OPEN":
      return "Open";
    case "APPLIED":
      return byWhen("Applied", f, timeZone);
    case "DISMISSED":
      return byWhen("Dismissed", f, timeZone);
    case "GONE":
      return "No longer found";
    default: {
      const unhandled: never = f.state;
      return unhandled;
    }
  }
}

const BOOKING_FIX: Record<BookingState, string> = {
  NONE: "Mark as no booking needed",
  TO_BOOK: "Mark as to book",
  BOOKED: "Mark as booked",
};

/**
 * The suggested fix, as the line under a Finding and the reason for its Apply
 * button. `replacesHours`: the Item already has opening hours, so the fix
 * replaces them rather than adding them.
 */
export function suggestedFixLabel(fix: SuggestedFix, opts: { replacesHours?: boolean } = {}): string {
  switch (fix.kind) {
    case "item.times": {
      const time =
        fix.startTime && fix.endTime ? `to ${fix.startTime}–${fix.endTime}`
        : fix.startTime ? `the start to ${fix.startTime}`
        : fix.endTime ? `the end to ${fix.endTime}`
        : null;
      const day = fix.date ? `on ${shortDate(fix.date)}` : null;
      if (time && day) return `Change ${time} ${day}`;
      if (time) return `Change ${time}`;
      return day ? `Move to ${shortDate(fix.date!)}` : "Change the time";
    }
    case "item.bookingState":
    case "transport.bookingState":
    case "accommodation.bookingState":
      return fix.bookBy ? `${BOOKING_FIX[fix.bookingState]}, by ${shortDate(fix.bookBy)}` : BOOKING_FIX[fix.bookingState];
    case "item.openingHours":
      return opts.replacesHours ? "Replace the opening hours" : "Add the opening hours";
    case "item.note":
      return `Add to the note: ${fix.append}`;
    default: {
      const unhandled: never = fix;
      return unhandled;
    }
  }
}

/** Where a Finding is fixed: an Item's or a day's page, a Stop on the plan, else the plan. The whole Trip has no single place. */
export function findingHref(f: Pick<FindingForView, "targetType" | "targetId" | "date">, base: string): Route | null {
  if (f.targetType === "TRIP") return null;
  if ((f.targetType === "ITEM" || f.targetType === "DAY") && f.date) return tripSubPath(base, `/day/${f.date}`);
  if (f.targetType === "STOP" && f.targetId) return tripSubPath(base, `/plan?stop=${encodeURIComponent(f.targetId)}`);
  return tripSubPath(base, "/plan");
}

/** The model's source URL, only when it is plain http(s): it is untrusted text. */
export function sourceLink(source: string | null): { href: string; host: string } | null {
  if (!source) return null;
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return { href: url.toString(), host: url.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

/** One Finding, ready to cross to the client. */
export interface FindingCard {
  id: string;
  severity: FindingSeverity;
  categoryLabel: string;
  title: string;
  detail: string;
  source: { href: string; host: string } | null;
  state: FindingState;
  stateLabel: string;
  /** The fix in words; null means Dismiss only (spec R8). */
  fixLabel: string | null;
  href: Route | null;
  /** R's FindingView flags, passed straight through: Apply/Dismiss only on the latest DONE Review; Undo of an Apply on any Review, Undo of a Dismiss only on the latest, a stranded Apply shows Undo. */
  canApply: boolean;
  canDismiss: boolean;
  canUndo: boolean;
}

export function toFindingCard(f: FindingForView, ctx: { base: string; timeZone: string }): FindingCard {
  return {
    id: f.id,
    severity: f.severity,
    categoryLabel: FINDING_CATEGORY_LABELS[f.category],
    title: f.title,
    detail: f.detail,
    source: sourceLink(f.source),
    state: f.state,
    stateLabel: findingStateLabel(f, ctx.timeZone),
    fixLabel: f.suggestedFix ? suggestedFixLabel(f.suggestedFix, { replacesHours: f.replacesHours }) : null,
    href: findingHref(f, ctx.base),
    canApply: f.canApply,
    canDismiss: f.canDismiss,
    canUndo: f.canUndo,
  };
}

export interface FindingGroup {
  severity: FindingSeverity;
  heading: "Warnings" | "Notes";
  cards: FindingCard[];
}

const STATE_ORDER: Record<FindingState, number> = { OPEN: 0, APPLIED: 1, DISMISSED: 2, GONE: 3 };

/** By severity (as FlagList does: Warnings, then Notes); inside each, what still needs doing first. */
export function groupFindings(cards: FindingCard[]): FindingGroup[] {
  return (["warning", "info"] as const)
    .map((severity) => ({
      severity,
      heading: severity === "warning" ? ("Warnings" as const) : ("Notes" as const),
      cards: cards.filter((c) => c.severity === severity).sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]),
    }))
    .filter((g) => g.cards.length > 0);
}

// ---------------------------------------------------------------------------
// One Review
// ---------------------------------------------------------------------------

/** What these helpers read from a Review row (R's `ReviewSummary`/`ReviewDetail` are wider). */
export interface ReviewForView {
  id: string;
  kind: ReviewKind;
  status: ReviewStatus;
  summary: string | null;
  /** Why a FAILED Review stopped: always one of REVIEW_MESSAGES (lib/review/messages.ts), or null. */
  error?: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  startedBy: TravellerRefLike;
}

/** The shown FAILED Review's line (final wave I2): what stopped it, and that nothing changed. */
export function failedReviewText(error: string | null | undefined): string {
  return error ? `This Review didn't finish. ${error} Nothing on the trip was changed.` : "This Review didn't finish. Nothing on the trip was changed.";
}

/** Spec R11: the tab's line while a Review runs. */
export function reviewingLine(startedBy: TravellerRefLike): string {
  return `Reviewing… (started by ${firstName(startedBy)})`;
}

/** The heading line for a shown Review: who ran it, and when. */
export function reviewByLine(review: Pick<ReviewForView, "startedBy" | "startedAt">, timeZone: string): string {
  return `Run by ${firstName(review.startedBy)}, ${formatReviewWhen(review.startedAt, timeZone)}`;
}

export interface HistoryRow {
  id: string;
  href: Route;
  kindLabel: string;
  byName: string;
  when: string;
  line: string;
  status: ReviewStatus;
  /** The Review the page is showing. */
  current: boolean;
}

function historyLine(r: ReviewForView): string {
  switch (r.status) {
    case "DONE":
      return r.summary?.trim() || "No summary";
    case "RUNNING":
      return "Still running";
    case "FAILED":
      // Final wave I2: say why, e.g. "Didn't finish: Claude was busy, so this Review stopped. …".
      return r.error ? `Didn't finish: ${r.error}` : "Didn't finish";
    default: {
      const unhandled: never = r.status;
      return unhandled;
    }
  }
}

/** Spec R10: every Review kept, as who, when, kind and its summary line; opening one shows its Findings. */
export function toHistoryRow(r: ReviewForView, ctx: { base: string; timeZone: string; currentId: string | null }): HistoryRow {
  return {
    id: r.id,
    href: tripSubPath(ctx.base, `/reviews?review=${encodeURIComponent(r.id)}`),
    kindLabel: REVIEW_KIND_LABELS[r.kind],
    byName: firstName(r.startedBy),
    when: formatReviewWhen(r.startedAt, ctx.timeZone),
    line: historyLine(r),
    status: r.status,
    current: r.id === ctx.currentId,
  };
}

/** Spec R10: Home's "N open from the <date> review", or nothing. Takes the latest DONE Review's count (lib/review-reads.ts latestReviewOpenCount). */
export function homeReviewLine(
  review: { startedAt: Date; openCount: number } | null,
  ctx: { base: string; timeZone: string },
): { text: string; href: Route } | null {
  if (!review || review.openCount === 0) return null;
  return {
    text: `${review.openCount} open from the ${formatReviewDay(review.startedAt, ctx.timeZone)} review`,
    href: tripSubPath(ctx.base, "/reviews"),
  };
}
