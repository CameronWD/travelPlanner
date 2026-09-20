import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { findMembership } from "@/lib/access";
import type { TripPhase } from "@/lib/trip-phase";

export { findMembership } from "@/lib/access";
export type { MembershipLike } from "@/lib/access";

/**
 * Require an authenticated user. Returns the session user, or redirects to
 * the sign-in page. Use at the top of server components / actions.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return session.user;
}

/**
 * Require that the current user is a member of `tripId`. Returns the user and
 * their membership. If the trip doesn't exist OR the user isn't a member we
 * return `notFound()` either way, so we never leak the existence of trips the
 * user can't access.
 *
 * Wrapped in React's `cache()`: memoised per request, keyed on `tripId`. Trip
 * Home calls this twice — once for the page, once inside
 * `listRemindersForTrip` — and that defence in depth is worth keeping; every
 * entry point should guard itself rather than trust its caller already did.
 * Paying for that with two identical DB round trips on the most-hit page in
 * the app was the part worth fixing, not the second call site itself. Do NOT
 * remove either call — `cache()` makes the second one free, it doesn't make
 * it redundant.
 *
 * `requireUser()` is memoised by extension: calling it from inside a cached
 * `requireTripAccess("trip1")` means a second `requireTripAccess("trip1")` in
 * the same request never re-runs `auth()` either. That's fine — the session
 * doesn't change mid-request. It does mean `requireUser` is only deduplicated
 * *through* this wrapper; checking access for several different trips in one
 * request still re-runs `auth()` once per distinct tripId, since the cache
 * key is `tripId`, not "no arguments." Not a bug, just not free lunch beyond
 * what's asked for here.
 *
 * CAVEAT — read this before adding a caller that mutates membership: a server
 * action that changes who's on a trip and then re-checks access on the same
 * `tripId` within the same request will read the memoised (stale) answer.
 * That failure is silent and dangerous in the specific way that matters here:
 * the check still *succeeds*, it just succeeds on yesterday's membership
 * table. Nothing in the codebase does this today. If you're about to write
 * something that adds or removes a member and then needs a fresh
 * authorization answer in the same request, do not call this function for
 * that second check — query membership directly, uncached.
 */
export const requireTripAccess = cache(async (tripId: string) => {
  const user = await requireUser();
  const members = await db.tripMember.findMany({
    where: { tripId },
    select: { userId: true, role: true, lastReadActivityAt: true },
  });
  const membership = findMembership(members, user.id);
  if (!membership) {
    notFound();
  }
  return { user, membership };
});

/**
 * Throw when the trip's phase does not allow forking. Forking is only
 * available before departure (sketching / planning / final-prep).
 */
export function assertForkingAllowed(phase: TripPhase): void {
  if (phase === "travelling" || phase === "past") {
    throw new Error("Forking is only available before departure");
  }
}

/**
 * Require that the current user can access the given fork. Verifies the fork
 * exists and that the user is a member of its parent trip. Returns the user,
 * the fork row, and the trip's date fields.
 */
export async function requireForkAccess(forkId: string) {
  const user = await requireUser();
  const fork = await db.fork.findUnique({
    where: { id: forkId },
    select: {
      id: true,
      tripId: true,
      name: true,
      trip: { select: { id: true, startDate: true, endDate: true } },
    },
  });
  if (!fork) notFound();
  await requireTripAccess(fork.tripId);
  return { user, fork, trip: fork.trip };
}
