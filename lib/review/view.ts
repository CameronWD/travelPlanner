import type { Route } from "next";
import type { Flag } from "@/lib/flags";
import { flagHref } from "@/lib/next-steps";
import { tripSubPath } from "@/lib/trip-path";
import { shortDate } from "@/lib/time-display";
import type { BookingState } from "@/lib/enum-values";
import {
  FINDING_CATEGORY_LABELS,
  REVIEW_KIND_LABELS,
  isChecklistFix,
  type FindingCategory,
  type FindingSeverity,
  type FindingShownState,
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

/** "14:05". */
function formatReviewClock(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${p.hour}:${p.minute}`;
}

/**
 * Spec 2026-10-18 A7: a display estimate for when to check back on a
 * running Review, distinct from REVIEW_STALE_AFTER_MS (lib/review/types.ts),
 * which is how long a run may go before it is treated as failed.
 */
export const REVIEW_BACK_AFTER_MS = 5 * 60_000;

/** "14:10": five minutes after the Review started, in the Trip's zone. */
export function reviewBackAround(startedAt: Date, timeZone: string): string {
  return formatReviewClock(new Date(startedAt.getTime() + REVIEW_BACK_AFTER_MS), timeZone);
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
  /** Shown (spec 2026-10-18 A4): FIXED is derived by R, never stored. */
  state: FindingShownState;
  stateAt: Date | null;
  stateBy: TravellerRefLike | null;
  /** R's FindingView flags (lib/review-reads.ts): the gating rules live there, not here. */
  canApply: boolean;
  canDismiss: boolean;
  canUndo: boolean;
  /** R's FindingView: an opening-hours fix on an Item that already has hours (final wave M6). */
  replacesHours?: boolean;
  /** R's FindingView: an Open restated Flag's Flag as it fires now; null otherwise (spec 2026-10-18 A1/A4). */
  liveFlag?: Flag | null;
}

function byWhen(verb: string, f: Pick<FindingForView, "stateAt" | "stateBy">, timeZone: string): string {
  const who = f.stateBy ? ` by ${firstName(f.stateBy)}` : "";
  const when = f.stateAt ? `, ${formatReviewDay(f.stateAt, timeZone)}` : "";
  return `${verb}${who}${when}`;
}

/** CONTEXT.md "Finding": Open, Applied (by, when), Dismissed (by, when), Fixed in the plan, No longer found. */
export function findingStateLabel(f: Pick<FindingForView, "state" | "stateAt" | "stateBy">, timeZone: string): string {
  switch (f.state) {
    case "OPEN":
      return "Open";
    case "APPLIED":
      return byWhen("Applied", f, timeZone);
    case "DISMISSED":
      return byWhen("Dismissed", f, timeZone);
    case "FIXED":
      return "Fixed in the plan";
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
    case "checklist.add":
      return fix.list === "PACKING" ? `Add to the packing list: ${fix.text}` : `Add to the pre-trip checklist: ${fix.text}`;
    default: {
      const unhandled: never = fix;
      return unhandled;
    }
  }
}

/** Where a Finding is fixed: an Item's or a day's page, a Stop on the plan, else the plan. The whole Trip has no single place. */
function findingHref(f: Pick<FindingForView, "targetType" | "targetId" | "date">, base: string): Route | null {
  if (f.targetType === "TRIP") return null;
  if ((f.targetType === "ITEM" || f.targetType === "DAY") && f.date) return tripSubPath(base, `/day/${f.date}`);
  if (f.targetType === "STOP" && f.targetId) return tripSubPath(base, `/plan?stop=${encodeURIComponent(f.targetId)}`);
  return tripSubPath(base, "/plan");
}

/** The verb for a Finding's go-to link: what opening its href does. */
function goToLabel(f: { targetType: FindingTargetType; date: string | null; liveFlag?: Flag | null }): string {
  const flag = f.liveFlag;
  if (flag?.connection) return "Add the transport";
  if (f.targetType === "DAY") return f.date ? "Open the day" : "Open the calendar";
  if (f.targetType === "ITEM" && f.date) return "Open the day";
  if (f.targetType === "STOP" || flag?.stopId) return "Open the stop";
  return "Open in the plan";
}

/**
 * Where a Finding is fixed (spec 2026-10-18 A1). A Flag's Finding that still
 * fires goes exactly where the Summary's Flag goes (flagHref): the label
 * reads the Finding's own targetType/date even then, so a retimed tight
 * connection (ITEM + date) still reads "Open the day", matching flagHref's
 * DAY link. Anything else goes by its own target; a whole-Trip Finding from
 * the Review's own checks (never a restated Flag) goes nowhere.
 */
export function findingGoTo(
  f: Pick<FindingForView, "targetType" | "targetId" | "date" | "liveFlag">,
  base: string,
): { href: Route; label: string } | null {
  if (f.liveFlag) return { href: flagHref(f.liveFlag, base), label: goToLabel(f) };
  const href = findingHref(f, base);
  return href ? { href, label: goToLabel(f) } : null;
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
  state: FindingShownState;
  stateLabel: string;
  /** The fix in words and what applying it does; null means Dismiss only (spec R8). Null unless the card is Open: a dealt-with card's fix is history, not an action. */
  fix: { kind: "row" | "packing" | "pretrip"; label: string } | null;
  /** Where to go to see or fix it, and the link's own verb; null for a whole-Trip Finding with nowhere to go. */
  goTo: { href: Route; label: string } | null;
  /** When it was last acted on, in epoch ms (null: never); drives the Dealt with list's order. */
  stateAtMs: number | null;
  /** R's FindingView flags, passed straight through: Apply/Dismiss only on the latest DONE Review; Undo of an Apply on any Review, Undo of a Dismiss only on the latest, a stranded Apply shows Undo. */
  canApply: boolean;
  canDismiss: boolean;
  canUndo: boolean;
}

export function toFindingCard(f: FindingForView, ctx: { base: string; timeZone: string }): FindingCard {
  const fix =
    f.state === "OPEN" && f.suggestedFix
      ? {
          kind: isChecklistFix(f.suggestedFix) ? (f.suggestedFix.list === "PACKING" ? ("packing" as const) : ("pretrip" as const)) : ("row" as const),
          label: suggestedFixLabel(f.suggestedFix, { replacesHours: f.replacesHours }),
        }
      : null;
  return {
    id: f.id,
    severity: f.severity,
    categoryLabel: FINDING_CATEGORY_LABELS[f.category],
    title: f.title,
    detail: f.detail,
    source: sourceLink(f.source),
    state: f.state,
    stateLabel: findingStateLabel(f, ctx.timeZone),
    fix,
    goTo: findingGoTo(f, ctx.base),
    stateAtMs: f.stateAt?.getTime() ?? null,
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

/** Dealt-with first by state, FIXED first: it needs nobody's attention at all, not even a glance at when. */
function dealtWithRank(c: Pick<FindingCard, "state" | "stateAtMs">): number {
  return c.state === "FIXED" ? Infinity : c.stateAtMs ?? -Infinity;
}

/**
 * Splits a Review's cards (spec 2026-10-18 A1): `open` is what still needs
 * doing, by severity (as FlagList does: Warnings, then Notes); `dealtWith` is
 * everything else, Fixed first, then most recently acted on, nulls last.
 */
export function partitionFindings(cards: FindingCard[]): { open: FindingGroup[]; dealtWith: FindingCard[] } {
  const open = (["warning", "info"] as const)
    .map((severity) => ({
      severity,
      heading: severity === "warning" ? ("Warnings" as const) : ("Notes" as const),
      cards: cards.filter((c) => c.severity === severity && c.state === "OPEN"),
    }))
    .filter((g) => g.cards.length > 0);
  const dealtWith = cards
    .filter((c) => c.state !== "OPEN")
    .sort((a, b) => {
      const ra = dealtWithRank(a);
      const rb = dealtWithRank(b);
      return ra === rb ? 0 : ra > rb ? -1 : 1;
    });
  return { open, dealtWith };
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

/**
 * Spec R11, amended 2026-10-18 A7: the tab's line while a Review runs. Says
 * it keeps going if you leave (the run carries on server-side in `after()`,
 * spec J) and gives a display estimate of when to check back.
 */
export function reviewingLine(startedBy: TravellerRefLike, startedAt: Date, timeZone: string): string {
  return `Reviewing… started by ${firstName(startedBy)} at ${formatReviewClock(startedAt, timeZone)}. This takes a few minutes and keeps going if you leave. Check back around ${reviewBackAround(startedAt, timeZone)}.`;
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

/**
 * Spec R10: Home's "N open from the <date> review", or nothing. Takes the
 * latest DONE Review's count (lib/review-reads.ts latestReviewOpenCount).
 *
 * Spec 2026-10-18 A7: `running` takes over ahead of that, whatever `review`
 * says — while a Review is running, Home says so and when to check back,
 * rather than a stale open count from before it started.
 */
export function homeReviewLine(
  review: { startedAt: Date; openCount: number } | null,
  ctx: { base: string; timeZone: string },
  running?: { startedAt: Date } | null,
): { text: string; href: Route } | null {
  const href = tripSubPath(ctx.base, "/reviews");
  if (running) return { text: `Review running, back around ${reviewBackAround(running.startedAt, ctx.timeZone)}`, href };
  if (!review || review.openCount === 0) return null;
  return { text: `${review.openCount} open from the ${formatReviewDay(review.startedAt, ctx.timeZone)} review`, href };
}
