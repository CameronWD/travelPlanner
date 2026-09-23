"use server";

import { db } from "@/lib/db";
import { requireUser, requireTripAccess } from "@/lib/guards";
import type { ActivityVerb, ActivityEntityType, ActivityChange, ActivitySummary } from "@/lib/activity";

export async function recordActivity(input: {
  tripId: string;
  verb: ActivityVerb;
  entityType: ActivityEntityType;
  entityId?: string | null;
  entityLabel: string;
  changes?: ActivityChange[] | { excerpt: string } | ActivitySummary | null;
}): Promise<void> {
  try {
    // Guarded by Trip membership, not just requireUser(): recordActivity is a
    // published server action, so a caller can name any tripId. Non-members
    // hit requireTripAccess's notFound() (a throw), which the catch{} below
    // absorbs — turning a forged call into a silent no-op rather than a
    // silent write into a Trip the caller isn't on (ARCH-TEN-2).
    // requireTripAccess is cache()'d, so calling it again here costs nothing
    // when the caller (e.g. deleteAttachment) already checked access for the
    // same tripId this request — see the comments atop lib/guards.ts.
    const { user } = await requireTripAccess(input.tripId);
    if (input.verb === "UPDATED" && Array.isArray(input.changes) && input.changes.length === 0) return; // no real change
    await db.activity.create({
      data: {
        tripId: input.tripId,
        actorId: user.id,
        verb: input.verb,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        entityLabel: input.entityLabel,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        changes: (input.changes ?? undefined) as any,
      },
    });
  } catch {
    // best-effort: never break the caller's mutation. recordActivity is
    // called from inside other mutations (e.g. deleteAttachment), so a
    // failure here — including requireTripAccess's notFound() throw above —
    // must never bubble up. This swallow is deliberate and intentionally
    // silent; making it observable is ARCH-OBS-3, deferred and out of scope
    // for this branch.
  }
}

export async function markAllRead(tripId: string): Promise<void> {
  const user = await requireUser();
  await db.tripMember.updateMany({
    where: { tripId, userId: user.id },
    data: { lastReadActivityAt: new Date() },
  });
}

export async function getRecentActivity(tripId: string, limit = 10) {
  await requireTripAccess(tripId);
  return db.activity.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { id: true, name: true, image: true } } },
  });
}

export async function getUnreadActivityCount(tripId: string): Promise<number> {
  const { user, membership } = await requireTripAccess(tripId);
  const since = membership.lastReadActivityAt ?? null;
  return db.activity.count({
    where: { tripId, actorId: { not: user.id }, ...(since ? { createdAt: { gt: since } } : {}) },
  });
}
