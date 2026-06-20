/**
 * Pure trip-access logic. Framework- and db-free so it is trivially
 * unit-testable; the server-side guards in `lib/guards.ts` build on top of it.
 */

/** Minimal shape of a trip membership needed to decide access. */
export interface MembershipLike {
  userId: string;
  role: string;
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
