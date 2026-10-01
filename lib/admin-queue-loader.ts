import { db } from "@/lib/db";
import type { AdminQueue } from "@/lib/admin-queue";

/**
 * Count the Admin queue (CONTEXT.md). Server only — imports the db; the
 * helpers that read the result live in lib/admin-queue.ts so client
 * components never pull this in.
 *
 * Not a guard and not an action: the callers (app/(app)/layout.tsx and
 * app/(app)/account/page.tsx) gate on isAdminEmail first, so a non-Admin
 * never pays for these two counts, and nothing here is reachable over the
 * network. Pending Access requests are `resolvedAt IS NULL`, never `status`
 * — approving stamps resolvedAt and leaves status "pending"
 * (server/actions/access-requests.ts listAccessRequests). Needs-review
 * notes count from every site: beta and main share the database, and a
 * note is waiting whichever site it was written on (spec 2026-10-02 §A).
 */
export async function countAdminQueue(): Promise<AdminQueue> {
  const [accessRequests, feedbackNeedingReview] = await Promise.all([
    db.accessRequest.count({ where: { resolvedAt: null } }),
    db.feedbackNote.count({ where: { status: "NEEDS_REVIEW" } }),
  ]);
  return { accessRequests, feedbackNeedingReview };
}
