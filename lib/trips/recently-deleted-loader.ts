/**
 * Loads the owner's "Recently deleted" Trips for the Trips page (ADR 0067).
 * A Trip appears here only for its owner (or a member Admin, via the same
 * "owner" role literal the ADR covers) and only while `deletedAt` is set;
 * the daily blob/row sweep removes it after 30 days.
 */
import { db } from "@/lib/db";

export interface RecentlyDeletedTrip {
  id: string;
  name: string;
  slug: string | null;
  deletedAt: Date;
}

export async function loadRecentlyDeleted(userId: string): Promise<RecentlyDeletedTrip[]> {
  const memberships = await db.tripMember.findMany({
    where: { userId, role: "owner", trip: { deletedAt: { not: null } } },
    select: { trip: { select: { id: true, name: true, slug: true, deletedAt: true } } },
    orderBy: { trip: { deletedAt: "desc" } },
  });

  // deletedAt is narrowed non-null by the `trip: { deletedAt: { not: null } }`
  // filter above; Prisma's generated type can't express that on a nested
  // select, so it comes back as Date | null.
  return memberships.map((m) => ({ ...m.trip, deletedAt: m.trip.deletedAt as Date }));
}
