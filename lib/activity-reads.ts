import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";

/**
 * The Trip's Activity feed reads (bell count, recent list). Pages reach them
 * through lib/trip-shell-reads.ts's cache() wrappers. Plain lib functions
 * (spec 2026-10-14 card 3.N): no longer published Server Actions.
 */

/**
 * Surprise (ADR 0051): rows inside a Surprise hidden from the viewer stay in
 * the database; once it is revealed they show again, in place.
 */
export async function getRecentActivity(tripId: string, limit = 10) {
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);
  return db.activity.findMany({
    where: { tripId, ...v.where.activity },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: TRAVELLER_SELECT } },
  });
}

/**
 * Surprise (CONTEXT.md, ADR 0051): the count ignores every row stamped as
 * inside a Surprise, hidden or not. A reveal must not pile the old lines onto
 * the bell, and the count has no per-Surprise reveal time to compare against,
 * so only unstamped rows count (the "revealed" line among them).
 */
export async function getUnreadActivityCount(tripId: string): Promise<number> {
  const { user, membership } = await requireTripAccess(tripId);
  const since = membership.lastReadActivityAt ?? null;
  return db.activity.count({
    where: { tripId, actorId: { not: user.id }, surpriseOfId: null, ...(since ? { createdAt: { gt: since } } : {}) },
  });
}
