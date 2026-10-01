/**
 * The **Admin queue** (CONTEXT.md): everything waiting on an Admin's
 * decision, counted together — pending Access requests plus Feedback notes
 * still at Needs review. Pure and client-safe (no db import), so the shell's
 * client components — the account menu, the Dock, the phone tab bar — can
 * use these helpers. The counts themselves come from
 * lib/admin-queue-loader.ts, which is server-only.
 *
 * Queue-based, not seen-based (spec 2026-10-02 §A): there is no "last
 * looked" anywhere; the total is simply what is still undecided.
 */
export interface AdminQueue {
  accessRequests: number;
  feedbackNeedingReview: number;
}

export const EMPTY_ADMIN_QUEUE: AdminQueue = { accessRequests: 0, feedbackNeedingReview: 0 };

export function adminQueueTotal(queue: AdminQueue): number {
  return queue.accessRequests + queue.feedbackNeedingReview;
}

/** Whether the dot shows: Admins only, and only while something is waiting. */
export function hasAdminQueue(isAdmin: boolean, queue: AdminQueue): boolean {
  return isAdmin && adminQueueTotal(queue) > 0;
}

/** "1 access request" / "3 access requests" — also used by the Account card with capitalised nouns. */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The menu badge's accessible name: "1 access request and 2 feedback notes waiting" — "" when nothing is. */
export function adminQueueLabel(queue: AdminQueue): string {
  const parts: string[] = [];
  if (queue.accessRequests > 0) parts.push(plural(queue.accessRequests, "access request", "access requests"));
  if (queue.feedbackNeedingReview > 0) {
    parts.push(plural(queue.feedbackNeedingReview, "feedback note", "feedback notes"));
  }
  return parts.length === 0 ? "" : `${parts.join(" and ")} waiting`;
}

/**
 * The accessible name of a trigger the dot sits on. The dot itself is
 * decorative; this is where the meaning lives. Unchanged when there is no
 * dot, so an unlit trigger reads exactly as it always did.
 */
export function withAdminQueueName(base: string, isAdmin: boolean, queue: AdminQueue): string {
  return hasAdminQueue(isAdmin, queue) ? `${base}, ${adminQueueTotal(queue)} waiting in Admin` : base;
}
