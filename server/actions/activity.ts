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
    const user = await requireUser();
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
    // best-effort: never break the caller's mutation
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
