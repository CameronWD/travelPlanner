"use server";

import { db } from "@/lib/db";
import { reportError } from "@/lib/error-sink";
import { requireUser, requireTripAccess } from "@/lib/guards";
import { isNextControlFlow } from "@/lib/next-control-flow";
import { currentActivitySource } from "@/lib/mcp/acting-traveller";
import type { ActivityVerb, ActivityEntityType, ActivityChange, ActivitySummary } from "@/lib/activity";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { surpriseRootForEntity, type SurpriseRoot } from "@/lib/surprise-guard";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";

export async function recordActivity(input: {
  tripId: string;
  verb: ActivityVerb;
  entityType: ActivityEntityType;
  entityId?: string | null;
  entityLabel: string;
  changes?: ActivityChange[] | { excerpt: string } | ActivitySummary | null;
  /**
   * The Surprise this row is inside (CONTEXT.md Surprise). `undefined`:
   * resolve it from entityType/entityId (the entity still exists). `null`:
   * not inside anything (the reveal line). A value: stamped as given (deletes
   * pass what the guard returned before the row was gone).
   */
  surpriseOf?: SurpriseRoot | null;
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
    const surpriseOf =
      input.surpriseOf !== undefined ? input.surpriseOf : await resolveSurpriseOf(input.entityType, input.entityId ?? null);
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
        source: currentActivitySource(),
        surpriseOfType: surpriseOf?.type ?? null,
        surpriseOfId: surpriseOf?.id ?? null,
      },
    });
  } catch (err) {
    // best-effort: never break the caller's mutation. recordActivity is
    // called from inside other mutations (e.g. deleteAttachment), so a
    // failure here must never bubble up. A guard refusal (requireTripAccess's
    // notFound() throw above, or a sign-in redirect) stays silent — it's a
    // forged or unauthenticated call, not a failure (ARCH-TEN-2); everything
    // else is reported before being swallowed (ARCH-OBS-3, ADR 0059).
    if (!isNextControlFlow(err)) await reportError(err, { route: "server/actions/activity.ts#recordActivity", source: "server" });
  }
}

/** A failed Surprise lookup must not drop the Activity row: it is written unstamped instead. */
async function resolveSurpriseOf(entityType: string, entityId: string | null): Promise<SurpriseRoot | null> {
  try {
    return await surpriseRootForEntity(entityType, entityId);
  } catch (err) {
    if (!isNextControlFlow(err)) await reportError(err, { route: "server/actions/activity.ts#resolveSurpriseOf", source: "server" });
    return null;
  }
}

export async function markAllRead(tripId: string): Promise<void> {
  const user = await requireUser();
  await db.tripMember.updateMany({
    where: { tripId, userId: user.id },
    data: { lastReadActivityAt: new Date() },
  });
}

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
