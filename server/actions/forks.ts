"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTripAccess, requireForkAccess, assertForkingAllowed } from "@/lib/guards";
import { computeTripPhase } from "@/lib/trip-phase";
import { buildForkPlan, MAX_FORKS } from "@/lib/fork-plan";
import { recordActivity } from "@/server/actions/activity";
import { todayISO } from "@/lib/dates";
import type { PlanId } from "@/lib/plan-scope";
import { computePlanMetrics, diffMetrics, type PlanMetrics, type MetricDeltas } from "@/lib/compare";

// ---------------------------------------------------------------------------
// listForks
// ---------------------------------------------------------------------------

export interface ForkListItem {
  id: string;
  name: string;
  sortOrder: number;
}

/**
 * List all forks for a trip in sortOrder.
 * Used by the trip layout to populate the ForkSwitcher.
 */
export async function listForks(tripId: string): Promise<ForkListItem[]> {
  await requireTripAccess(tripId);
  return db.fork.findMany({
    where: { tripId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, sortOrder: true },
  });
}

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
      // Placements only — wishlist ideas (date null) are trip-wide/shared and
      // must never be copied into a fork (C1a).
      db.item.findMany({ where: { ...sourceWhere, date: { not: null } } }),
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

      // Skip any cost whose owner was NOT copied into the fork (C1a). This drops
      // ITEM costs owned by wishlist ideas (never copied) and any dangling-owner
      // cost. Only copy a cost if it is ownerless (OTHER / sourceOwnerId null) OR
      // its owner was actually copied (newOwnerId resolved).
      if (c.sourceOwnerId != null && newOwnerId == null) continue;

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

// ---------------------------------------------------------------------------
// Result type shared by renameFork / discardFork
// ---------------------------------------------------------------------------

export type ForkMutationResult = { success: true } | { success: false; error: string };

// ---------------------------------------------------------------------------
// renameFork
// ---------------------------------------------------------------------------

const renameSchema = z.object({
  name: z.string().trim().min(1, "Name must not be empty"),
});

/**
 * Rename an existing fork.
 */
export async function renameFork(
  forkId: string,
  name: string,
): Promise<ForkMutationResult> {
  // 1. Parse & validate
  const parsed = renameSchema.safeParse({ name });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid name" };
  }
  const trimmedName = parsed.data.name;

  // 2. Auth + existence check
  const { fork } = await requireForkAccess(forkId);
  const tripId = fork.tripId;

  // 3. Persist
  await db.fork.update({ where: { id: forkId }, data: { name: trimmedName } });

  // 4. Activity log
  await recordActivity({
    tripId,
    verb: "UPDATED",
    entityType: "FORK",
    entityId: forkId,
    entityLabel: trimmedName,
  });

  // 5. Cache invalidation
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/compare`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// discardFork
// ---------------------------------------------------------------------------

/**
 * Permanently delete a fork (cascade removes its plan rows).
 */
export async function discardFork(forkId: string): Promise<ForkMutationResult> {
  // 1. Auth + existence check — capture fork name before deletion
  const { fork } = await requireForkAccess(forkId);
  const { tripId, name } = fork;

  // 2. Delete (schema cascade handles child rows)
  await db.fork.delete({ where: { id: forkId } });

  // 3. Activity log
  await recordActivity({
    tripId,
    verb: "DELETED",
    entityType: "FORK",
    entityId: forkId,
    entityLabel: name,
  });

  // 4. Cache invalidation
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/compare`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// getComparison
// ---------------------------------------------------------------------------

export interface ComparisonPlan {
  forkId: string | null;
  name: string;
  metrics: PlanMetrics;
}

export interface ComparisonResult {
  trip: {
    id: string;
    name: string;
    startDate: string | null;
    hardEndDate: string | null;
    homeCurrency: string;
    drivingWindingFactor: number;
    drivingAvgSpeedKph: number;
  };
  plans: ComparisonPlan[];
}

/**
 * Load the real plan + all forks for a trip and compute PlanMetrics for each.
 * Read-only — no mutations, no revalidation, no activity log.
 */
export async function getComparison(tripId: string): Promise<ComparisonResult> {
  // 1. Auth check
  await requireTripAccess(tripId);

  // 2. Load trip fields needed by computePlanMetrics + forks in sortOrder
  const [trip, forks] = await Promise.all([
    db.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        name: true,
        startDate: true,
        hardEndDate: true,
        homeCurrency: true,
        drivingWindingFactor: true,
        drivingAvgSpeedKph: true,
      },
    }),
    db.fork.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!trip) throw new Error(`Trip ${tripId} not found`);

  // 3. Build plan id list: real plan (null) + each fork in sortOrder
  const planEntries: { forkId: string | null; name: string }[] = [
    { forkId: null, name: "Real plan" },
    ...forks.map((f) => ({ forkId: f.id, name: f.name })),
  ];

  // 4. Load shared exchange rates once (trip-scoped, not per-plan)
  const exchangeRates = await db.exchangeRate.findMany({
    where: { tripId },
    select: { base: true, quote: true, rate: true },
  });

  // 5. Load all six collections for every plan in parallel
  const planData = await Promise.all(
    planEntries.map(async ({ forkId }) => {
      const where = { tripId, forkId };
      const [stops, transports, accommodations, items, costs] = await Promise.all([
        db.stop.findMany({
          where,
          select: {
            id: true,
            name: true,
            country: true,
            nights: true,
            sortOrder: true,
            arriveDate: true,
            departDate: true,
            pinned: true,
            lat: true,
            lng: true,
            timezone: true,
          },
        }),
        db.transport.findMany({
          where,
          select: {
            id: true,
            mode: true,
            fromStopId: true,
            toStopId: true,
            depAt: true,
            arrAt: true,
          },
        }),
        db.accommodation.findMany({
          where,
          select: {
            id: true,
            stopId: true,
            name: true,
            checkIn: true,
            checkOut: true,
          },
        }),
        db.item.findMany({
          // Placements only — unscheduled wishlist ideas (date null) are not part
          // of the arrangement being compared (C1c). Keeps real-vs-fork symmetric.
          where: { ...where, date: { not: null } },
          select: {
            id: true,
            stopId: true,
            date: true,
            startTime: true,
            endTime: true,
            lat: true,
            lng: true,
            category: true,
          },
        }),
        db.cost.findMany({
          where,
          select: {
            id: true,
            estimatedMinor: true,
            actualMinor: true,
            currency: true,
            rateToHome: true,
            ownerType: true,
            ownerId: true,
            label: true,
            category: true,
          },
        }),
      ]);
      return { stops, transports, accommodations, items, costs };
    }),
  );

  // 6. Map rows to PlanMetricsInput and compute metrics
  const tripFields = {
    startDate: trip.startDate,
    hardEndDate: trip.hardEndDate,
    homeCurrency: trip.homeCurrency,
    drivingWindingFactor: trip.drivingWindingFactor,
    drivingAvgSpeedKph: trip.drivingAvgSpeedKph,
  };

  const plans: ComparisonPlan[] = planEntries.map(({ forkId, name }, i) => {
    const { stops, transports, accommodations, items, costs } = planData[i];

    // Map DB rows to CompareStop/CompareTransport shapes.
    // - timezone: DB is nullable; CompareStop requires string — fall back to "UTC".
    // - depAt/arrAt: DB returns Date | null; CompareTransport requires string | null.
    const compareStops = stops.map((s) => ({
      ...s,
      timezone: s.timezone ?? "UTC",
    }));

    const compareTransports = transports.map((t) => ({
      ...t,
      depAt: t.depAt instanceof Date ? t.depAt.toISOString() : (t.depAt ?? null),
      arrAt: t.arrAt instanceof Date ? t.arrAt.toISOString() : (t.arrAt ?? null),
    }));

    const metrics = computePlanMetrics({
      stops: compareStops,
      transports: compareTransports,
      accommodations,
      items,
      costs,
      trip: tripFields,
      exchangeRates,
    });
    return { forkId, name, metrics };
  });

  return { trip, plans };
}

// ---------------------------------------------------------------------------
// getPromotionPreview
// ---------------------------------------------------------------------------

export interface PromotionLossItem {
  kind: "PAID_COST" | "CONFIRMATION" | "ATTACHMENT";
  label: string;
}

export interface PromotionPreview {
  lossList: PromotionLossItem[];
  deltas: MetricDeltas;
}

/**
 * Inspect the current real plan (forkId: null) for committed data that would
 * be lost if the given fork were promoted. Also computes metric deltas
 * (real plan → fork).
 */
export async function getPromotionPreview(forkId: string): Promise<PromotionPreview> {
  // 1. Auth — get fork + tripId
  const { fork } = await requireForkAccess(forkId);
  const tripId = fork.tripId;

  // 2. Load the real plan's six entity collections (forkId: null)
  const realWhere = { tripId, forkId: null };
  const forkWhere = { tripId, forkId };

  const [
    realStops, realTransports, realAccommodations, realItems, realCosts,
    forkStops, forkTransports, forkAccommodations, forkItems, forkCosts,
  ] = await Promise.all([
    db.stop.findMany({ where: realWhere, select: { id: true, name: true, country: true, nights: true, sortOrder: true, arriveDate: true, departDate: true, pinned: true, lat: true, lng: true, timezone: true } }),
    db.transport.findMany({ where: realWhere, select: { id: true, mode: true, fromStopId: true, toStopId: true, depAt: true, arrAt: true, reference: true } }),
    db.accommodation.findMany({ where: realWhere, select: { id: true, stopId: true, name: true, checkIn: true, checkOut: true, confirmation: true } }),
    db.item.findMany({ where: { ...realWhere, date: { not: null } }, select: { id: true, stopId: true, date: true, startTime: true, endTime: true, lat: true, lng: true, category: true } }),
    db.cost.findMany({ where: realWhere, select: { id: true, estimatedMinor: true, actualMinor: true, currency: true, rateToHome: true, ownerType: true, ownerId: true, label: true, category: true, paidAt: true } }),
    db.stop.findMany({ where: forkWhere, select: { id: true, name: true, country: true, nights: true, sortOrder: true, arriveDate: true, departDate: true, pinned: true, lat: true, lng: true, timezone: true } }),
    db.transport.findMany({ where: forkWhere, select: { id: true, mode: true, fromStopId: true, toStopId: true, depAt: true, arrAt: true } }),
    db.accommodation.findMany({ where: forkWhere, select: { id: true, stopId: true, name: true, checkIn: true, checkOut: true } }),
    db.item.findMany({ where: { ...forkWhere, date: { not: null } }, select: { id: true, stopId: true, date: true, startTime: true, endTime: true, lat: true, lng: true, category: true } }),
    db.cost.findMany({ where: forkWhere, select: { id: true, estimatedMinor: true, actualMinor: true, currency: true, rateToHome: true, ownerType: true, ownerId: true, label: true, category: true } }),
  ]);

  // 3. Collect real-plan entity IDs for attachment lookup
  const realStopIds = new Set(realStops.map((s) => s.id));
  const realTransportIds = new Set(realTransports.map((t) => t.id));
  const realAccommodationIds = new Set(realAccommodations.map((a) => a.id));
  const realItemIds = new Set(realItems.map((i) => i.id));

  // 4. Load trip fields + exchange rates for metrics
  const [trip, exchangeRates] = await Promise.all([
    db.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        name: true,
        startDate: true,
        hardEndDate: true,
        homeCurrency: true,
        drivingWindingFactor: true,
        drivingAvgSpeedKph: true,
      },
    }),
    db.exchangeRate.findMany({
      where: { tripId },
      select: { base: true, quote: true, rate: true },
    }),
  ]);

  if (!trip) throw new Error(`Trip ${tripId} not found`);

  // 5. Load attachments for the trip, filter to those targeting real-plan entities
  const allAttachments = await db.attachment.findMany({
    where: { tripId },
    select: { id: true, filename: true, targetType: true, targetId: true },
  });

  // 6. Build loss list
  const lossList: PromotionLossItem[] = [];

  // PAID_COST — real-plan costs that have been paid
  for (const cost of realCosts) {
    if (cost.paidAt !== null) {
      lossList.push({ kind: "PAID_COST", label: cost.label ?? `Cost ${cost.id}` });
    }
  }

  // CONFIRMATION — real-plan accommodations with confirmation
  for (const acc of realAccommodations) {
    if (acc.confirmation !== null) {
      lossList.push({ kind: "CONFIRMATION", label: acc.name ?? `Accommodation ${acc.id}` });
    }
  }

  // CONFIRMATION — real-plan transports with reference
  for (const transport of realTransports) {
    if (transport.reference !== null && transport.reference !== undefined) {
      lossList.push({ kind: "CONFIRMATION", label: `${transport.mode} ref: ${transport.reference}` });
    }
  }

  // ATTACHMENT — attachments pointing at real-plan Stop/Transport/Accommodation/Item
  for (const att of allAttachments) {
    if (!att.targetId) continue;
    const { targetType, targetId } = att;
    const isRealPlanEntity =
      (targetType === "STOP" && realStopIds.has(targetId)) ||
      (targetType === "TRANSPORT" && realTransportIds.has(targetId)) ||
      (targetType === "ACCOMMODATION" && realAccommodationIds.has(targetId)) ||
      (targetType === "ITEM" && realItemIds.has(targetId));

    if (isRealPlanEntity) {
      lossList.push({ kind: "ATTACHMENT", label: att.filename });
    }
  }

  // 7. Compute metric deltas
  const tripFields = {
    startDate: trip.startDate,
    hardEndDate: trip.hardEndDate,
    homeCurrency: trip.homeCurrency,
    drivingWindingFactor: trip.drivingWindingFactor,
    drivingAvgSpeedKph: trip.drivingAvgSpeedKph,
  };

  const mapStop = (s: typeof realStops[number]) => ({ ...s, timezone: s.timezone ?? "UTC" });
  const mapTransport = (t: { id: string; mode: string; fromStopId: string | null; toStopId: string | null; depAt: Date | string | null; arrAt: Date | string | null }) => ({
    ...t,
    depAt: t.depAt instanceof Date ? t.depAt.toISOString() : (t.depAt ?? null),
    arrAt: t.arrAt instanceof Date ? t.arrAt.toISOString() : (t.arrAt ?? null),
  });

  const realPlanMetrics = computePlanMetrics({
    stops: realStops.map(mapStop),
    transports: realTransports.map(mapTransport),
    accommodations: realAccommodations,
    items: realItems,
    costs: realCosts,
    trip: tripFields,
    exchangeRates,
  });

  const forkMetrics = computePlanMetrics({
    stops: forkStops.map(mapStop),
    transports: forkTransports.map(mapTransport),
    accommodations: forkAccommodations,
    items: forkItems,
    costs: forkCosts,
    trip: tripFields,
    exchangeRates,
  });

  const deltas = diffMetrics(realPlanMetrics, forkMetrics);

  return { lossList, deltas };
}

// ---------------------------------------------------------------------------
// promoteFork
// ---------------------------------------------------------------------------

export type PromoteForkResult = { success: true } | { success: false; error: string };

/**
 * Promote a fork to become the new real plan.
 *
 * Transaction ordering (critical — avoids relational/unique clashes):
 *   1. Delete old real-plan rows for all six entities (forkId: null).
 *   2. Retag the promoted fork's rows to forkId: null.
 *   3. Delete ALL forks for the trip (the promoted one now has no rows;
 *      others cascade-delete their rows).
 *
 * This leaves exactly one real plan and zero forks.
 */
export async function promoteFork(forkId: string): Promise<PromoteForkResult> {
  // 1. Auth + existence check
  const { fork, trip } = await requireForkAccess(forkId);
  const tripId = fork.tripId;

  // 2. Phase gate
  try {
    assertForkingAllowed(
      computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today: todayISO() }),
    );
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Promoting not allowed in this phase",
    };
  }

  // 3. Transaction — strictly ordered
  await db.$transaction(async (tx) => {
    // Step 1: delete old real-plan rows for all six entities.
    //
    // Wishlist ideas (Item rows with date null) are trip-wide/shared and are NOT
    // part of any plan — they must survive promotion (C1b). So we delete only
    // real-plan PLACEMENTS (date not null), and preserve ITEM costs owned by
    // surviving ideas.
    await tx.stop.deleteMany({ where: { tripId, forkId: null } });
    await tx.chapter.deleteMany({ where: { tripId, forkId: null } });
    await tx.transport.deleteMany({ where: { tripId, forkId: null } });
    await tx.accommodation.deleteMany({ where: { tripId, forkId: null } });
    await tx.item.deleteMany({ where: { tripId, forkId: null, date: { not: null } } });

    // Gather surviving wishlist idea ids so their ITEM costs are preserved.
    const ideas = await tx.item.findMany({
      where: { tripId, forkId: null, date: null },
      select: { id: true },
    });
    await tx.cost.deleteMany({
      where: {
        tripId,
        forkId: null,
        NOT: { ownerType: "ITEM", ownerId: { in: ideas.map((i) => i.id) } },
      },
    });

    // Step 2: retag the promoted fork's rows to forkId: null (they become the real plan)
    await tx.stop.updateMany({ where: { forkId }, data: { forkId: null } });
    await tx.chapter.updateMany({ where: { forkId }, data: { forkId: null } });
    await tx.transport.updateMany({ where: { forkId }, data: { forkId: null } });
    await tx.accommodation.updateMany({ where: { forkId }, data: { forkId: null } });
    await tx.item.updateMany({ where: { forkId }, data: { forkId: null } });
    await tx.cost.updateMany({ where: { forkId }, data: { forkId: null } });

    // Step 3: remove ALL forks for this trip (promoted one now has no rows;
    // any other forks cascade-delete their rows)
    await tx.fork.deleteMany({ where: { tripId } });
  });

  // 4. Record activity — use recordActivity directly (not fork-silencing guard)
  await recordActivity({
    tripId,
    verb: "PROMOTED",
    entityType: "FORK",
    entityId: forkId,
    entityLabel: fork.name,
  });

  // 5. Revalidate all live surfaces
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/plan`);
  revalidatePath(`/trips/${tripId}/calendar`);
  revalidatePath(`/trips/${tripId}/budget`);
  revalidatePath(`/trips/${tripId}/summary`);
  revalidatePath(`/trips/${tripId}/compare`);

  return { success: true };
}
