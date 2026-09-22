/**
 * Pure trip-access logic. Framework- and db-free so it is trivially
 * unit-testable; the server-side guards in `lib/guards.ts` build on top of it.
 */

import { isAdminEmail } from "@/lib/admin";

/** Minimal shape of a trip membership needed to decide access. */
export interface MembershipLike {
  userId: string;
  role: string;
  lastReadActivityAt?: Date | null;
}

/**
 * Given a trip's members, return the membership for `userId`, or null if they
 * are not a member.
 */
export function findMembership<T extends MembershipLike>(
  members: readonly T[],
  userId: string,
): T | null {
  return members.find((m) => m.userId === userId) ?? null;
}

/**
 * Pure owner-or-admin predicate (ARCH-BND-3). Extracted from three hand-rolled
 * copies in server/actions/trips.ts (deleteTrip, duplicateTrip) and
 * server/actions/invites.ts (inviteToTrip), each of which returns a
 * user-facing typed error rather than throwing — so those call sites use this
 * predicate directly instead of the throwing `requireTripOwner` in
 * `lib/guards.ts` (which re-exports this function).
 *
 * Lives here rather than in `lib/guards.ts` deliberately: this file is
 * framework- and db-free (see the module comment above), and `lib/guards.ts`
 * transitively imports `lib/auth.ts` → next-auth → `next/server`. A test file
 * that wants the real predicate without dragging in next-auth's module graph
 * should import it from here.
 *
 * Does not check membership itself — callers are expected to have already
 * called `requireTripAccess` (or equivalent), same as the three copies did.
 */
export function isTripOwnerOrAdmin(
  membership: { role: string },
  email: string | null | undefined,
): boolean {
  return membership.role === "owner" || isAdminEmail(email);
}
