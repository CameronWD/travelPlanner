import { cache } from "react";
import { notFound } from "next/navigation";
import { signInRedirect } from "@/lib/sign-in-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { findMembership, isTripOwnerOrAdmin } from "@/lib/access";
import { isAdminEmail } from "@/lib/admin";
import { getActingTraveller } from "@/lib/mcp/acting-traveller";
import type { TripPhase } from "@/lib/trip-phase";

export { isTripOwnerOrAdmin } from "@/lib/access";

/**
 * Require an authenticated user. Returns the session user, or redirects to
 * the Landing with the requested page as callbackUrl (lib/sign-in-redirect.ts;
 * there is no sign-in page — ADR 0057, amended 2026-10-01). Use at the top
 * of server components / actions.
 *
 * Wrapped in React's `cache()`, exactly like `requireTripAccess` below and
 * for the same reason: memoised per request, so this is pure deduplication
 * with no behavioural change — a session cannot change mid-request. Before
 * this was cached, `requireTripAccess` already was (it calls `requireUser`
 * internally), which meant any page calling both `requireUser` directly
 * *and* `requireTripAccess` — or calling `requireUser` directly from more
 * than one component in the same render, as What's new's banner does on
 * every arrival page — paid for two `auth()` verifications instead of one.
 * Callers must still call it — `cache()` makes the second call free, it
 * does not make it unnecessary. Every entry point guarding itself is
 * deliberate defence in depth; see the longer warning on `requireTripAccess`
 * for the one case where that memoisation is a trap.
 *
 * Spec 2026-10-09: inside /api/mcp the Traveller comes from a verified
 * Claude connection token, not a session cookie. getActingTraveller() reads
 * that acting Traveller when one is scoped (lib/mcp/acting-traveller.ts);
 * requireUser consults it before auth(), so every guard and action
 * downstream runs unchanged, as that Traveller.
 */
export const requireUser = cache(async () => {
  // Spec 2026-10-09: inside /api/mcp the Traveller comes from a verified
  // Claude connection token, not a session cookie. Same user shape as the
  // session's, so every guard and action downstream is unchanged.
  const acting = getActingTraveller();
  if (acting) return acting;
  const session = await auth();
  if (!session?.user?.id) return signInRedirect();
  return session.user;
});

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
 * `requireUser()` is cached in its own right (see above), so the `auth()`
 * call inside this function is free no matter how many times `requireUser`
 * or `requireTripAccess` were already called this request. What is *not*
 * free beyond that: checking access for several different trips in one
 * request still re-runs the membership query once per distinct `tripId`,
 * since this cache's key is `tripId`. Not a bug, just not free lunch beyond
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
    select: { userId: true, role: true, lastReadActivityAt: true, trip: { select: { deletedAt: true } } },
  });
  const membership = findMembership(members, user.id);
  // ADR 0067 (Recently deleted): a stamped Trip is invisible to every member,
  // same as a non-member — notFound() either way, never a 200 with a
  // tombstoned trip. `m.trip?.` so mocks seeded before this change (with no
  // `trip` on their rows) keep reading as "not deleted".
  if (!membership || members.some((m) => m.trip?.deletedAt)) {
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
    throw new Error("What-if plans are only available before the trip starts.");
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
      trip: { select: { id: true, startDate: true, endDate: true, forksEnabled: true } },
    },
  });
  if (!fork) notFound();
  await requireTripAccess(fork.tripId);
  return { user, fork, trip: fork.trip };
}

/**
 * Require that the current user OWNS `tripId` (or is an ADMIN_EMAILS operator
 * who is already a member — ADR 0045 grants no access to trips they aren't
 * on). For new callers that want a throwing guard rather than a typed error
 * result; see `isTripOwnerOrAdmin` for the pure predicate used by call sites
 * that return a friendly error message instead.
 *
 * Extracted from three hand-rolled copies (ARCH-BND-3). Non-members get the
 * same notFound() as requireTripAccess, so this never leaks a trip's existence.
 */
export async function requireTripOwner(tripId: string) {
  const { user, membership } = await requireTripAccess(tripId);
  if (!isTripOwnerOrAdmin(membership, user.email)) {
    notFound();
  }
  return { user, membership };
}

/** Require an ADMIN_EMAILS operator. notFound() for everyone else. */
export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  return user;
}
