import { db } from "@/lib/db";
import { reportError } from "@/lib/error-sink";
import { requireTripAccess } from "@/lib/guards";
import { isNextControlFlow } from "@/lib/next-control-flow";
import { currentActivitySource } from "@/lib/mcp/acting-traveller";
import type { ActivityVerb, ActivityEntityType, ActivityChange, ActivitySummary } from "@/lib/activity";
import { surpriseRootForEntity, type SurpriseRoot } from "@/lib/surprise-guard";

/**
 * The one writer of Activity rows the app's actions use (lib/activity-guard.ts
 * wraps it for plan entities; Forks stay silent there). A plain lib module,
 * not a "use server" action (spec 2026-10-14 card 3.N): nothing outside the
 * server ever needed to call it, and as a published action any client could
 * name any tripId (ARCH-TEN-2).
 */
export interface RecordActivityInput {
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
}

export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    // Guarded by Trip membership, not just requireUser(): the actor is the
    // signed-in Traveller, and a call for a Trip they aren't on hits
    // requireTripAccess's notFound() (a throw), which the catch{} below
    // absorbs — a silent no-op rather than a write into someone else's Trip
    // (ARCH-TEN-2). requireTripAccess is cache()'d, so calling it again here
    // costs nothing when the caller already checked access for the same
    // tripId this request — see the comments atop lib/guards.ts.
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
    // best-effort: never break the caller's mutation. A guard refusal stays
    // silent (ARCH-TEN-2); everything else is reported before being
    // swallowed (ARCH-OBS-3, ADR 0059).
    if (!isNextControlFlow(err)) await reportError(err, { route: "lib/activity-record.ts#recordActivity", source: "server" });
  }
}

/** A failed Surprise lookup must not drop the Activity row: it is written unstamped instead. */
async function resolveSurpriseOf(entityType: string, entityId: string | null): Promise<SurpriseRoot | null> {
  try {
    return await surpriseRootForEntity(entityType, entityId);
  } catch (err) {
    if (!isNextControlFlow(err)) await reportError(err, { route: "lib/activity-record.ts#resolveSurpriseOf", source: "server" });
    return null;
  }
}
