"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess, assertForkingAllowed } from "@/lib/guards";
import { computeTripPhase } from "@/lib/trip-phase";
import { buildForkPlan } from "@/lib/fork-plan";
import { recordActivity } from "@/server/actions/activity";
import { todayISO } from "@/lib/dates";
import type { PlanId } from "@/lib/plan-scope";

const MAX_FORKS = 4;

export type CreateForkResult =
  | { success: true; forkId: string }
  | { success: false; error: string };

/**
 * Deep-copy a plan into a new Fork within a transaction, remapping foreign
 * keys through ID maps.
 *
 * @param tripId       The owning trip.
 * @param name         Optional display name for the fork.
 * @param sourceForkId The plan to copy from. `null` / omitted = real plan.
 *                     Pass a forkId to copy from another fork.
 */
export async function createFork(
  tripId: string,
  name?: string,
  sourceForkId?: PlanId,
): Promise<CreateForkResult> {
  // 1. Auth check
  const { user } = await requireTripAccess(tripId);

  // 2. Load trip for phase gate
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { id: true, startDate: true, endDate: true },
  });
  if (!trip) return { success: false, error: "Trip not found" };

  // 3. Phase gate — forking is only allowed before departure
  try {
    assertForkingAllowed(
      computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today: todayISO() }),
    );
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Forking not allowed in this phase",
    };
  }

  // 4. Soft cap — check before opening the transaction
  const count = await db.fork.count({ where: { tripId } });
  if (count >= MAX_FORKS) {
    return {
      success: false,
      error: `You have reached the maximum of ${MAX_FORKS} forks — discard one first.`,
    };
  }

  // 5. Load six source entity collections, scoped to the source plan
  const sourcePlanForkId: string | null = sourceForkId ?? null;
  const sourceWhere = { tripId, forkId: sourcePlanForkId };

  const [chapters, stops, transports, accommodations, items, costs] =
    await Promise.all([
      db.chapter.findMany({ where: sourceWhere }),
      db.stop.findMany({ where: sourceWhere }),
      db.transport.findMany({ where: sourceWhere }),
      db.accommodation.findMany({ where: sourceWhere }),
      db.item.findMany({ where: sourceWhere }),
      db.cost.findMany({ where: sourceWhere }),
    ]);

  // 6. Build create-payloads (pure, no IDs minted yet)
  const plan = buildForkPlan({ chapters, stops, transports, accommodations, items, costs });

  // 7. Transaction: mint IDs for every entity, remap FKs via ID maps
  const fork = await db.$transaction(async (tx) => {
    // Create the Fork row
    const newFork = await tx.fork.create({
      data: {
        tripId,
        name: name?.trim() || `Variant ${count + 1}`,
        sortOrder: count,
        createdById: user.id,
      },
    });
    const forkId = newFork.id;

    // Chapters
    const chapterIdMap = new Map<string, string>(); // sourceId → newId
    for (const c of plan.chapters) {
      const created = await tx.chapter.create({
        data: { tripId, forkId, ...c.data },
      });
      chapterIdMap.set(c.sourceId, created.id);
    }

    // Stops (remap chapterId)
    const stopIdMap = new Map<string, string>(); // sourceId → newId
    for (const s of plan.stops) {
      const created = await tx.stop.create({
        data: {
          tripId,
          forkId,
          chapterId: s.sourceChapterId ? (chapterIdMap.get(s.sourceChapterId) ?? null) : null,
          ...s.data,
        },
      });
      stopIdMap.set(s.sourceId, created.id);
    }

    // Accommodations (remap stopId; build accIdMap keyed by SOURCE accommodation id)
    const accIdMap = new Map<string, string>(); // sourceAccId → newAccId
    for (let i = 0; i < plan.accommodations.length; i++) {
      const a = plan.accommodations[i];
      const newStopId = a.sourceStopId ? stopIdMap.get(a.sourceStopId) : undefined;
      if (!newStopId) throw new Error(`createFork: accommodation references uncopied stop ${a.sourceStopId}`);
      const created = await tx.accommodation.create({
        data: {
          tripId,
          forkId,
          stopId: newStopId,
          ...a.data,
        },
      });
      // Key by the SOURCE accommodation id from the original array
      accIdMap.set(accommodations[i].id, created.id);
    }

    // Items (remap stopId; build itemIdMap keyed by SOURCE item id)
    const itemIdMap = new Map<string, string>(); // sourceItemId → newItemId
    for (let i = 0; i < plan.items.length; i++) {
      const it = plan.items[i];
      const created = await tx.item.create({
        data: {
          tripId,
          forkId,
          stopId: it.sourceStopId ? (stopIdMap.get(it.sourceStopId) ?? null) : null,
          ...it.data,
        },
      });
      itemIdMap.set(items[i].id, created.id);
    }

    // Transports (remap fromStopId/toStopId; build transportIdMap keyed by SOURCE transport id)
    const transportIdMap = new Map<string, string>(); // sourceTransportId → newTransportId
    for (let i = 0; i < plan.transports.length; i++) {
      const t = plan.transports[i];
      const created = await tx.transport.create({
        data: {
          tripId,
          forkId,
          fromStopId: t.sourceFromStopId ? (stopIdMap.get(t.sourceFromStopId) ?? null) : null,
          toStopId: t.sourceToStopId ? (stopIdMap.get(t.sourceToStopId) ?? null) : null,
          ...t.data,
        },
      });
      transportIdMap.set(transports[i].id, created.id);
    }

    // Costs — remap ownerId via the correct ID map by ownerType
    for (const c of plan.costs) {
      const newOwnerId =
        c.sourceOwnerId == null
          ? null
          : c.sourceOwnerType === "ACCOMMODATION"
            ? (accIdMap.get(c.sourceOwnerId) ?? null)
            : c.sourceOwnerType === "ITEM"
              ? (itemIdMap.get(c.sourceOwnerId) ?? null)
              : c.sourceOwnerType === "TRANSPORT"
                ? (transportIdMap.get(c.sourceOwnerId) ?? null)
                : null; // OTHER costs have no owner

      await tx.cost.create({
        data: {
          tripId,
          forkId,
          ...c.data,
          ownerId: newOwnerId,
        },
      });
    }

    return newFork;
  });

  // 8. Best-effort activity log (never breaks the mutation)
  await recordActivity({
    tripId,
    verb: "CREATED",
    entityType: "FORK",
    entityId: fork.id,
    entityLabel: fork.name,
  });

  // 9. Cache invalidation
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/compare`);

  return { success: true, forkId: fork.id };
}
