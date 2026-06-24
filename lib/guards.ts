import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { findMembership } from "@/lib/access";

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
