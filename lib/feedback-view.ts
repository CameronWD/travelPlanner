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
    status: row.status as FeedbackStatus,
    authoredAt: row.authoredAt.toISOString(),
    siteChip: site === currentSite ? null : siteLabel(site),
  };
}
