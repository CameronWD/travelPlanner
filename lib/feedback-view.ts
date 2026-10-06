/**
 * lib/feedback-view.ts — the row → panel shape for a **Feedback note**.
 *
 * Pure mapping, no I/O. It lives here rather than in
 * `server/actions/feedback.ts` because that module carries the `"use server"`
 * directive, and Next requires every *value* export from such a module to be
 * an async function — the whole module is published as callable endpoints.
 * Exporting `toView` from there so a test could call it made the branch fail
 * `next build` with `Server Actions must be async functions.`, and the obvious
 * repair (making it `async`) would have been worse: it would publish a pure
 * mapper as a network-reachable action. Same reasoning as `lib/fork-plan.ts`
 * and `lib/chapters.ts`.
 *
 * `lib/feedback-inbox.ts` is the sibling of this file on the export side: it
 * maps the same table into the committed inbox document (ADR 0040), where this
 * one maps it into what the Feedback panel renders.
 */

import type { FeedbackStatus } from "@/lib/enums";
import { MONTH_SHORT } from "@/lib/dates";
import { siteLabel, siteOf } from "@/lib/feedback-site";

/** A Feedback note as the Feedback panel sees it. Dates are ISO strings. */
export type FeedbackNoteView = {
  id: string;
  body: string;
  route: string;
  pageLabel: string;
  tripName: string | null;
  authorName: string;
  /**
   * Whether the viewer may retract this note. Computed here rather than
   * shipping `authorId` and letting the client compare: since ADR 0046 an
   * Admin receives every author's notes, so the raw id was other Travellers'
   * user ids crossing the boundary to answer one boolean (FN-04).
   */
  canDelete: boolean;
  status: FeedbackStatus;
  authoredAt: string;
  /**
   * Label of the site this note was written on, only when it isn't the site
   * being viewed.
   */
  siteChip: string | null;
  /**
   * The operator's reply that closed this note (CONTEXT.md "Resolution"),
   * written to its author. Null while open, or when closed without one.
   */
  resolution: string | null;
  /** ISO; when the note was closed as Done / Won't fix. Null while open. */
  resolvedAt: string | null;
};

/** The columns `VIEW_SELECT` reads, as Prisma returns them. */
export type FeedbackNoteQueryRow = {
  id: string;
  body: string;
  route: string;
  pageLabel: string;
  tripName: string | null;
  authorId: string;
  authorName: string | null;
  status: string;
  authoredAt: Date;
  site: string | null;
  resolution: string | null;
  resolvedAt: Date | null;
};

/** The Prisma selection every action backing the Feedback panel reads. */
export const VIEW_SELECT = {
  id: true,
  body: true,
  route: true,
  pageLabel: true,
  tripName: true,
  authorId: true,
  authorName: true,
  status: true,
  authoredAt: true,
  site: true,
  resolution: true,
  resolvedAt: true,
} as const;

export function toView(
  row: FeedbackNoteQueryRow,
  viewerId: string,
  currentSite: string,
): FeedbackNoteView {
  const site = siteOf(row.site);
  return {
    id: row.id,
    body: row.body,
    route: row.route,
    pageLabel: row.pageLabel,
    tripName: row.tripName,
    authorName: row.authorName ?? "Traveller",
    canDelete: row.authorId === viewerId,
    // The author's panel shows a Needs-review note exactly as an Open one
    // (CONTEXT.md "Feedback note"; ADR 0040, amended 2026-09-29): vetting is
    // the operator's concern, not something the author waits on in the log.
    status: row.status === "NEEDS_REVIEW" ? "OPEN" : (row.status as FeedbackStatus),
    authoredAt: row.authoredAt.toISOString(),
    siteChip: site === currentSite ? null : siteLabel(site),
    resolution: row.resolution?.trim() ? row.resolution : null,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

/**
 * How long a closed note stays in its author's Feedback panel before it waits
 * behind "Show resolved" (spec 2026-10-05 §A): long enough to read the
 * Resolution, short enough that the log doesn't fill with finished business.
 * It stands in for a "seen" state, which was decided against.
 */
export const RESOLVED_SHOWN_FOR_MS = 7 * 24 * 60 * 60 * 1000;

const CLOSED_LABEL: Partial<Record<string, string>> = {
  DONE: "Done",
  WONTFIX: "Won't fix",
};

/**
 * Whether the panel hides this note behind "Show resolved". That is true for a
 * note closed as Done or Won't fix more than 7 days before `now`; a note
 * resolved exactly 7 days ago still shows. A closed note with no `resolvedAt`
 * counts as old. Open notes and unrecognised statuses are never hidden: the
 * panel labels an unfamiliar status rather than burying it.
 */
export function isHiddenResolved(
  note: Pick<FeedbackNoteView, "status" | "resolvedAt">,
  now: Date,
): boolean {
  if (!CLOSED_LABEL[note.status]) return false;
  if (note.resolvedAt === null) return true;
  return now.getTime() - Date.parse(note.resolvedAt) > RESOLVED_SHOWN_FOR_MS;
}

/**
 * The line beneath a closed note: "Done 5 Oct — {Resolution}", or just
 * "Done 5 Oct" when there is no Resolution text. Null for a note that isn't
 * closed. The date is the viewer's own calendar day.
 */
export function resolutionLine(
  note: Pick<FeedbackNoteView, "status" | "resolution" | "resolvedAt">,
): string | null {
  const label = CLOSED_LABEL[note.status];
  if (!label) return null;
  const when = note.resolvedAt ? new Date(note.resolvedAt) : null;
  const head = when ? `${label} ${when.getDate()} ${MONTH_SHORT[when.getMonth()]}` : label;
  return note.resolution ? `${head} — ${note.resolution}` : head;
}

/**
 * A Needs-review Feedback note as /admin lists it (spec 2026-10-02 §D).
 * Read-only: no status and no canDelete — the list is defined by its query
 * (status = NEEDS_REVIEW), and nothing on that page acts on a note.
 */
export type FeedbackReviewView = {
  id: string;
  body: string;
  pageLabel: string;
  tripName: string | null;
  authorName: string;
  /** ISO. */
  authoredAt: string;
  /** Label of the site this note was written on, only when it isn't the site being viewed. */
  siteChip: string | null;
};

/** The columns `REVIEW_SELECT` reads, as Prisma returns them. */
export type FeedbackReviewQueryRow = {
  id: string;
  body: string;
  pageLabel: string;
  tripName: string | null;
  authorName: string | null;
  authoredAt: Date;
  site: string | null;
};

/** The Prisma selection listFeedbackNeedingReview reads. */
export const REVIEW_SELECT = {
  id: true,
  body: true,
  pageLabel: true,
  tripName: true,
  authorName: true,
  authoredAt: true,
  site: true,
} as const;

/**
 * Deliberately NOT `toView`: that mapper renames Needs review to Open for
 * the author's panel (ADR 0040 amended 2026-09-29), which is exactly what
 * the review list must not do.
 */
export function toReviewView(row: FeedbackReviewQueryRow, currentSite: string): FeedbackReviewView {
  const site = siteOf(row.site);
  return {
    id: row.id,
    body: row.body,
    pageLabel: row.pageLabel,
    tripName: row.tripName,
    authorName: row.authorName ?? "Traveller",
    authoredAt: row.authoredAt.toISOString(),
    siteChip: site === currentSite ? null : siteLabel(site),
  };
}
