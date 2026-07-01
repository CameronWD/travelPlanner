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
 */
export async function requireTripAccess(tripId: string) {
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
}

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
