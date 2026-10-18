"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money/money";
import { requireTripAccess, requireForkAccess, assertForkingAllowed, isTripOwnerOrAdmin } from "@/lib/guards";
import { computeTripPhase } from "@/lib/trip-phase";
import { buildForkPlan, MAX_FORKS } from "@/lib/fork-plan";
import { recordActivity } from "@/lib/activity-record";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
import { tripTodayISO } from "@/lib/trip-today";
import { parseOpeningHours } from "@/lib/validations/opening-hours";
import { PLAN_PLACEMENT_WHERE, WISHLIST_IDEA_WHERE, REAL_PLAN, type PlanId } from "@/lib/plan-scope";
import { computePlanMetrics, diffMetrics, type PlanMetrics, type MetricDeltas } from "@/lib/compare";
import { copyItemPhoto } from "@/lib/item-photo-copy";
import { deleteItemAttachmentsTx } from "@/lib/item-attachment-cleanup";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import { readPlan } from "@/lib/plan-reads";
import { type ActionResult, formFail } from "@/lib/action-result";
import { revalidateTrip } from "@/lib/revalidate";
import { growTripEndTx, tripWindowScopes } from "@/server/actions/trip-window";

/** Why a Fork create/promote is refused on a trip with plan variants off. */
const PLAN_VARIANTS_OFF_ERROR = "What-if plans are off for this trip. Turn them on in Settings.";

export type CreateForkResult = ActionResult<{ forkId: string }>;

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
    select: {
      id: true,
      startDate: true,
      endDate: true,
      forksEnabled: true,
      // The trip's own clock, for the phase gate below. Same shape and same
      // filter as app/(app)/trips/[tripId]/layout.tsx, which decides whether
      // the fork switcher is even shown — the two must agree on what "today"
      // is or the control renders while the action refuses (AB-03).
      stops: {
        where: { ...REAL_PLAN, arriveDate: { not: null } },
        orderBy: { sortOrder: "asc" },
        select: { timezone: true, arriveDate: true, departDate: true },
      },
    },
  });
  if (!trip) return formFail("Trip not found");

  // Plan variants are opt-in per trip (spec B3) — the switcher is hidden when
  // off; this is the server-side half of that gate.
  if (!trip.forksEnabled) {
    return formFail(PLAN_VARIANTS_OFF_ERROR);
  }

  // 3. Phase gate — forking is only allowed before departure
  try {
    assertForkingAllowed(
      computeTripPhase({
        startDate: trip.startDate,
        endDate: trip.endDate,
        today: todayISOInZone(currentTripTimezone(trip.stops)),
      }),
    );
  } catch (err) {
    return formFail(err instanceof Error ? err.message : "What-if plans are only available before the trip starts.");
  }

  // 4. Soft cap — check before opening the transaction
  const count = await db.fork.count({ where: { tripId } });
  if (count >= MAX_FORKS) {
    return formFail(`You have reached the maximum of ${MAX_FORKS} what-if plans. Discard one first.`);
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
      // Plan placements only — trip-wide/shared wishlist ideas (no stop, no
      // date) must never be copied into a fork (C1a). ADR 0022: a placement is
      // any Item with a Stop OR a date, so dateless stop things-to-do copy too.
      db.item.findMany({ where: { ...sourceWhere, ...PLAN_PLACEMENT_WHERE } }),
      db.cost.findMany({ where: sourceWhere }),
    ]);

  // DayTitle has no forkId/tripId of its own (CONTEXT.md "Day title" —  it
  // hangs off its owning Stop), so it's scoped by the source Stops' ids
  // rather than sourceWhere.
  const dayTitles = stops.length
    ? await db.dayTitle.findMany({ where: { stopId: { in: stops.map((s) => s.id) } } })
    : [];

  // 6. Build create-payloads (pure, no IDs minted yet)
  const plan = buildForkPlan({ chapters, stops, transports, accommodations, items, costs });

  // 7. Transaction: mint IDs for every entity, remap FKs via ID maps
  const { newFork: fork, photoCopies } = await db.$transaction(async (tx) => {
    // Create the Fork row
    const newFork = await tx.fork.create({
      data: {
        tripId,
        name: name?.trim() || `What-if plan ${count + 1}`,
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

    // Day titles ride with their Stop (CONTEXT.md "Day title") — copied
    // verbatim (dayIndex/title unchanged) onto the new Stop id. No sourceId
    // to remap through a plan.* array since DayTitle isn't part of
    // buildForkPlan's output; it's copied directly here via stopIdMap.
    for (const t of dayTitles) {
      const newStopId = stopIdMap.get(t.stopId);
      if (!newStopId) continue; // every source stop above was copied, so this shouldn't happen
      await tx.dayTitle.create({
        data: { stopId: newStopId, dayIndex: t.dayIndex, title: t.title },
      });
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
    // CONTEXT.md "Item photo" (spec §I): "Fork copy likewise [copies the
    // storage object]" — collected here and resolved AFTER this transaction
    // commits (below), never inside it: copyItemPhoto calls storage.copy,
    // and network I/O must not hold a DB transaction open (ADR 0007, same
    // rule createFork already follows for FX resolution elsewhere).
    const photoCopies: Array<{ newItemId: string; sourcePhotoAttachmentId: string }> = [];
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
      if (it.sourcePhotoAttachmentId) {
        photoCopies.push({ newItemId: created.id, sourcePhotoAttachmentId: it.sourcePhotoAttachmentId });
      }
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
          // The leg's slot, on the variant's own Stop (spec 2026-10-04 §D).
          anchorStopId: t.sourceAnchorStopId ? (stopIdMap.get(t.sourceAnchorStopId) ?? null) : null,
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

    return { newFork, photoCopies };
  });

  // 7b. Copy each placed Item's photo onto its own new Attachment + storage
  // object (spec §I) — deliberately OUTSIDE the transaction above (ADR 0007).
  // Best-effort per item: copyItemPhoto reports and returns null on any
  // failure, and the fork must still succeed with no photo on that Item
  // rather than fail the whole createFork (Task 8 brief) — never a dangling
  // photoAttachmentId.
  for (const { newItemId, sourcePhotoAttachmentId } of photoCopies) {
    const copiedPhotoId = await copyItemPhoto({
      tripId,
      sourcePhotoAttachmentId,
      targetItemId: newItemId,
    });
    if (copiedPhotoId) {
      await db.item.update({ where: { id: newItemId }, data: { photoAttachmentId: copiedPhotoId } });
    }
  }

  // 8. Best-effort activity log (never breaks the mutation)
  await recordActivity({
    tripId,
    verb: "CREATED",
    entityType: "FORK",
    entityId: fork.id,
    entityLabel: fork.name,
  });

  // 9. Cache invalidation
  revalidateTrip(tripId, "plan", "money");

  return { success: true, forkId: fork.id };
}

// ---------------------------------------------------------------------------
// Result type shared by renameFork / discardFork
// ---------------------------------------------------------------------------

export type ForkMutationResult = ActionResult;

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
    return formFail(parsed.error.issues[0]?.message ?? "Invalid name");
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
  revalidateTrip(tripId, "plan", "money");

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

  // 2. Delete (schema cascade handles child rows). Attachments aren't a
  // relation, so the fork's Item-photo copies (and any other ITEM
  // attachments on its Items) are removed — and their blobs scheduled —
  // in the same transaction (final review #2).
  await db.$transaction(async (tx) => {
    const forkItems = await tx.item.findMany({ where: { tripId, forkId }, select: { id: true } });
    await deleteItemAttachmentsTx(tx, tripId, forkItems.map((i) => i.id));
    await tx.fork.delete({ where: { id: forkId } });
  });

  // 3. Activity log
  await recordActivity({
    tripId,
    verb: "DELETED",
    entityType: "FORK",
    entityId: forkId,
    entityLabel: name,
  });

  // 4. Cache invalidation
  revalidateTrip(tripId, "plan", "money");

  return { success: true };
}

// ---------------------------------------------------------------------------
// moveFork
// ---------------------------------------------------------------------------

/**
 * Reorder a fork by swapping its sortOrder with the adjacent fork.
 * Cosmetic only (drives Compare column + switcher order) — no FOR UPDATE lock
 * (a transposed cosmetic order self-heals on the next move) and no Activity log
 * (forks stay silent except created/promoted/discarded).
 */
export async function moveFork(
  forkId: string,
  direction: "left" | "right",
): Promise<ForkMutationResult> {
  const { fork } = await requireForkAccess(forkId);
  const tripId = fork.tripId;

  const forks = await db.fork.findMany({
    where: { tripId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });

  const idx = forks.findIndex((f) => f.id === forkId);
  if (idx === -1) return { success: true }; // vanished mid-flight — nothing to do
  const swapIdx = direction === "left" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= forks.length) return { success: true }; // at the edge — no-op

  const current = forks[idx];
  const neighbour = forks[swapIdx];

  await db.$transaction(async (tx) => {
    await tx.fork.update({ where: { id: current.id }, data: { sortOrder: neighbour.sortOrder } });
    await tx.fork.update({ where: { id: neighbour.id }, data: { sortOrder: current.sortOrder } });
  });

  revalidateTrip(tripId, "plan");
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
    forksEnabled: boolean;
  };
  plans: ComparisonPlan[];
}

/**
 * Load the real plan + all forks for a trip and compute PlanMetrics for each.
 * Read-only — no mutations, no revalidation, no activity log.
 */
export async function getComparison(tripId: string): Promise<ComparisonResult> {
  // 1. Auth check
  const { user } = await requireTripAccess(tripId);

  // 2. Forks in sortOrder
  const forks = await db.fork.findMany({
    where: { tripId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  // 3. Build plan id list: real plan (null) + each fork in sortOrder
  const planEntries: { forkId: string | null; name: string }[] = [
    { forkId: null, name: "Real plan" },
    ...forks.map((f) => ({ forkId: f.id, name: f.name })),
  ];

  // 4. Every plan's rows through the Plan reader (lib/plan-reads.ts): one
  // cached Trip shell and one trip-wide exchange-rate read per plan; Items
  // are Plan placements only — trip-wide wishlist ideas (no stop, no date)
  // are not part of the arrangement being compared (C1c, ADR 0022). The
  // viewer's Surprises apply as on the Plan page (Costs stay unfiltered, so
  // the budget total keeps hidden money).
  const planData = await Promise.all(planEntries.map(({ forkId }) => readPlan(tripId, user.id, forkId)));

  // 5. Trip fields (from the cached shell readPlan carries)
  const shell = planData[0].trip;
  const trip: ComparisonResult["trip"] = {
    id: shell.id,
    name: shell.name,
    startDate: shell.startDate,
    hardEndDate: shell.hardEndDate,
    homeCurrency: shell.homeCurrency,
    drivingWindingFactor: shell.drivingWindingFactor,
    drivingAvgSpeedKph: shell.drivingAvgSpeedKph,
    forksEnabled: shell.forksEnabled,
  };

  // 6. Map rows to PlanMetricsInput and compute metrics
  const tripFields = {
    startDate: shell.startDate,
    hardEndDate: shell.hardEndDate,
    homeCurrency: shell.homeCurrency,
    drivingWindingFactor: shell.drivingWindingFactor,
    drivingAvgSpeedKph: shell.drivingAvgSpeedKph,
    roundTrip: shell.roundTrip,
    homeName: shell.homeName,
    homeLat: shell.homeLat,
    homeLng: shell.homeLng,
    homeCountryCode: shell.homeCountryCode,
    homeTimezone: shell.homeTimezone,
  };

  // Spec 2026-10-17 R7: every plan's book-by Flags count from the Trip's own
  // today, the real plan's (planData[0]), so the columns compare like with like.
  const today = tripTodayISO(planData[0].stops);

  const plans: ComparisonPlan[] = planEntries.map(({ forkId, name }, i) => {
    const { stops, transports, accommodations, items, costs, exchangeRates } = planData[i];

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
      today,
    });
    return { forkId, name, metrics };
  });

  return { trip, plans };
}

// ---------------------------------------------------------------------------
// getPromotionPreview
// ---------------------------------------------------------------------------

interface PromotionLossItem {
  kind: "PAID_COST" | "CONFIRMATION" | "ATTACHMENT";
  label: string;
}

export interface PromotionPreview {
  lossList: PromotionLossItem[];
  deltas: MetricDeltas;
}

// The fields Compare's metrics read (lib/compare.ts; Compare takes them from
// lib/plan-reads.ts), so the preview's Flag delta counts the planning Flags
// (spec 2026-10-17 R7) exactly as Compare does.
const PREVIEW_TRANSPORT_SELECT = {
  id: true, mode: true, fromStopId: true, toStopId: true, depAt: true, arrAt: true, arrIsHome: true, bookingState: true, bookBy: true,
} as const;
const PREVIEW_ACCOMMODATION_SELECT = { id: true, stopId: true, name: true, checkIn: true, checkOut: true, bookingState: true, bookBy: true } as const;
const PREVIEW_ITEM_SELECT = {
  id: true, stopId: true, date: true, startTime: true, endTime: true, lat: true, lng: true, category: true,
  title: true, openingHours: true, slotTime: true, arriveByMinutes: true, bookingState: true, bookBy: true,
} as const;

/**
 * Inspect the current real plan (forkId: null) for committed data that would
 * be lost if the given fork were promoted. Also computes metric deltas
 * (real plan → fork).
 */
export async function getPromotionPreview(forkId: string): Promise<PromotionPreview> {
  // 1. Auth — get fork + tripId
  const { user, fork } = await requireForkAccess(forkId);
  const tripId = fork.tripId;

  // Surprise (CONTEXT.md): the loss list names Cost labels, Accommodation
  // names and Attachment filenames, so what is inside a Surprise the viewer
  // is surprised by is left out in the query, like every other reader.
  const v = await loadSurpriseVisibility(tripId, user.id);

  // 2. Load the real plan's six entity collections (forkId: null)
  const realWhere = { tripId, ...REAL_PLAN };
  const forkWhere = { tripId, forkId };

  const [
    realStops, realTransports, realAccommodations, realItems, realCosts,
    forkStops, forkTransports, forkAccommodations, forkItems, forkCosts,
  ] = await Promise.all([
    db.stop.findMany({ where: realWhere, select: { id: true, name: true, country: true, nights: true, sortOrder: true, arriveDate: true, departDate: true, pinned: true, lat: true, lng: true, timezone: true } }),
    db.transport.findMany({ where: realWhere, select: { ...PREVIEW_TRANSPORT_SELECT, reference: true } }),
    db.accommodation.findMany({ where: { ...realWhere, ...v.where.accommodation }, select: { ...PREVIEW_ACCOMMODATION_SELECT, confirmation: true } }),
    db.item.findMany({ where: { ...realWhere, ...PLAN_PLACEMENT_WHERE, ...v.where.item }, select: { ...PREVIEW_ITEM_SELECT, photoAttachmentId: true } }),
    db.cost.findMany({ where: { ...realWhere, ...v.where.cost }, select: { id: true, costMinor: true, paidMinor: true, currency: true, rateToHome: true, ownerType: true, ownerId: true, label: true, category: true, paidAt: true } }),
    db.stop.findMany({ where: forkWhere, select: { id: true, name: true, country: true, nights: true, sortOrder: true, arriveDate: true, departDate: true, pinned: true, lat: true, lng: true, timezone: true } }),
    db.transport.findMany({ where: forkWhere, select: PREVIEW_TRANSPORT_SELECT }),
    db.accommodation.findMany({ where: { ...forkWhere, ...v.where.accommodation }, select: PREVIEW_ACCOMMODATION_SELECT }),
    db.item.findMany({ where: { ...forkWhere, ...PLAN_PLACEMENT_WHERE, ...v.where.item }, select: PREVIEW_ITEM_SELECT }),
    db.cost.findMany({ where: { ...forkWhere, ...v.where.cost }, select: { id: true, costMinor: true, paidMinor: true, currency: true, rateToHome: true, ownerType: true, ownerId: true, label: true, category: true, paidAt: true } }),
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
        roundTrip: true,
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
    where: { tripId, ...v.where.attachment },
    select: { id: true, filename: true, targetType: true, targetId: true },
  });

  // 6. Build loss list
  const lossList: PromotionLossItem[] = [];

  // PAID_COST — real-plan costs that have been paid. Named by title and
  // amount (what was paid, else the cost), never by id: the Traveller is
  // confirming an irreversible step against this list (LA-146).
  for (const cost of realCosts) {
    if (cost.paidAt !== null) {
      const amountMinor = cost.paidMinor ?? cost.costMinor;
      lossList.push({
        kind: "PAID_COST",
        label: `${cost.label ?? "Untitled cost"} · ${formatMoney(amountMinor, cost.currency)}`,
      });
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

  // ATTACHMENT — attachments pointing at real-plan Stop/Transport/Accommodation/Item.
  // An Item's photo (spec §I) is not listed: the Fork carries its own copy
  // of it (createFork → copyItemPhoto), so it isn't lost on promotion
  // (final review #2).
  const itemPhotoIds = new Set(
    realItems.map((i) => i.photoAttachmentId).filter((id): id is string => !!id),
  );
  for (const att of allAttachments) {
    if (!att.targetId) continue;
    if (itemPhotoIds.has(att.id)) continue;
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
    roundTrip: trip.roundTrip,
  };

  const mapStop = (s: typeof realStops[number]) => ({ ...s, timezone: s.timezone ?? "UTC" });
  const mapTransport = (t: { id: string; mode: string; fromStopId: string | null; toStopId: string | null; depAt: Date | string | null; arrAt: Date | string | null; arrIsHome?: boolean | null }) => ({
    ...t,
    depAt: t.depAt instanceof Date ? t.depAt.toISOString() : (t.depAt ?? null),
    arrAt: t.arrAt instanceof Date ? t.arrAt.toISOString() : (t.arrAt ?? null),
  });

  const mapItem = <T extends { openingHours: string | null }>(i: T) => ({ ...i, openingHours: parseOpeningHours(i.openingHours) });
  // Both sides count from the Trip's own today, the real plan's, as Compare does.
  const today = tripTodayISO(realStops);

  const realPlanMetrics = computePlanMetrics({
    stops: realStops.map(mapStop),
    transports: realTransports.map(mapTransport),
    accommodations: realAccommodations,
    items: realItems.map(mapItem),
    costs: realCosts,
    trip: tripFields,
    exchangeRates,
    today,
  });

  const forkMetrics = computePlanMetrics({
    stops: forkStops.map(mapStop),
    transports: forkTransports.map(mapTransport),
    accommodations: forkAccommodations,
    items: forkItems.map(mapItem),
    costs: forkCosts,
    trip: tripFields,
    exchangeRates,
    today,
  });

  const deltas = diffMetrics(realPlanMetrics, forkMetrics);

  return { lossList, deltas };
}

// ---------------------------------------------------------------------------
// promoteFork
// ---------------------------------------------------------------------------

export type PromoteForkResult = ActionResult;

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
  const { user, fork, trip } = await requireForkAccess(forkId);
  const tripId = fork.tripId;

  // ARCH-DAT-1b: promoting a Fork is whole-branch destruction — it discards
  // the current real plan (and every other Fork), irreversibly — so it is
  // owner-only even though editing a Fork stays open to every Traveller.
  // requireForkAccess above only checked membership; a second
  // `requireTripAccess` call gets the role — free, since it's `cache()`-
  // memoised per `tripId` (see lib/guards.ts), rather than a second uncached
  // query, since requireForkAccess's return shape doesn't carry the role.
  const { membership } = await requireTripAccess(tripId);
  if (!isTripOwnerOrAdmin(membership, user.email)) {
    return formFail("Only the trip owner can make this the real plan.");
  }

  // A dormant Fork (plan variants off, spec B3) can't be promoted — promoting
  // discards the real plan, so it must never happen from a hidden variant.
  if (!trip.forksEnabled) {
    return formFail(PLAN_VARIANTS_OFF_ERROR);
  }

  // 2. Phase gate
  // Same clock the fork switcher uses (see createFork above, AB-03).
  const gateStops = await db.stop.findMany({
    where: { tripId, ...REAL_PLAN, arriveDate: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { timezone: true, arriveDate: true, departDate: true },
  });

  try {
    assertForkingAllowed(
      computeTripPhase({
        startDate: trip.startDate,
        endDate: trip.endDate,
        today: todayISOInZone(currentTripTimezone(gateStops)),
      }),
    );
  } catch (err) {
    return formFail(err instanceof Error ? err.message : "What-if plans are only available before the trip starts.");
  }

  // 3. Transaction — strictly ordered
  // F4: set when the Trip window moved (a first start, or a grown end), so the
  // layout's date range refreshes.
  let windowMovedTo: string | null = null;
  await db.$transaction(async (tx) => {
    // Step 1: delete old real-plan rows for all six entities.
    //
    // ADR 0022: trip-wide/shared wishlist ideas (no Stop AND no date) are NOT
    // part of any plan — they must survive promotion (C1b). So we delete only
    // real-plan PLACEMENTS (Stop OR date, which now includes dateless stop
    // things-to-do), and preserve ITEM costs owned by surviving ideas.
    //
    // Items going away — the real plan's placements (deleted below) and
    // every OTHER Fork's Items (cascade-deleted in step 3) — lose their ITEM
    // attachments (Fork photo copies included) in this same transaction:
    // Attachment isn't a relation, so nothing else would (final review #2).
    const doomedItems = await tx.item.findMany({
      where: {
        tripId,
        OR: [
          { ...REAL_PLAN, ...PLAN_PLACEMENT_WHERE },
          { AND: [{ forkId: { not: null } }, { NOT: { forkId } }] },
        ],
      },
      select: { id: true },
    });
    await deleteItemAttachmentsTx(tx, tripId, doomedItems.map((i) => i.id));

    await tx.stop.deleteMany({ where: { tripId, ...REAL_PLAN } });
    await tx.chapter.deleteMany({ where: { tripId, ...REAL_PLAN } });
    await tx.transport.deleteMany({ where: { tripId, ...REAL_PLAN } });
    await tx.accommodation.deleteMany({ where: { tripId, ...REAL_PLAN } });
    await tx.item.deleteMany({ where: { tripId, ...REAL_PLAN, ...PLAN_PLACEMENT_WHERE } });

    // Gather surviving wishlist idea ids so their ITEM costs are preserved.
    // Ideas are the both-null items only — a dateless stop placement is NOT an
    // idea (it was deleted above; its cost should be replaced, not preserved).
    const ideas = await tx.item.findMany({
      where: { tripId, ...REAL_PLAN, ...WISHLIST_IDEA_WHERE },
      select: { id: true },
    });
    await tx.cost.deleteMany({
      where: {
        tripId,
        ...REAL_PLAN,
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

    // F4: the promoted rows are now the real plan — the soft end covers them
    // (never shrinks; the Hard end date is untouched, ADR 0068). A Fork's
    // firm-up no longer dates the Trip, so a date-less Trip takes its start
    // here, from the promoted plan's first scheduled arrival, as the firm-ups
    // do on the real plan (a Rough month falls away — CONTEXT.md).
    if (!trip.startDate) {
      const first = await tx.stop.findFirst({
        where: { tripId, ...REAL_PLAN, arriveDate: { not: null } },
        orderBy: { arriveDate: "asc" },
        select: { arriveDate: true },
      });
      if (first?.arriveDate) {
        const { count } = await tx.trip.updateMany({
          where: { id: tripId, startDate: null },
          data: { startDate: first.arriveDate, roughMonth: null },
        });
        if (count > 0) windowMovedTo = first.arriveDate;
      }
    }
    windowMovedTo = (await growTripEndTx(tx, tripId, null)) ?? windowMovedTo;
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
  revalidateTrip(tripId, "plan", "money", ...tripWindowScopes(windowMovedTo));

  return { success: true };
}
