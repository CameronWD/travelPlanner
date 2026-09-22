"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { itemSchema, type ItemInput } from "@/lib/validations/item";
import { resolveOwningStop, type ItineraryStop } from "@/lib/itinerary";
import { geocodePlaceDetailed } from "@/lib/geocode";
import { recordPlanActivity } from "@/lib/activity-guard";
import { entityLabel, describeChanges } from "@/lib/activity";
import { planScope, type PlanId } from "@/lib/plan-scope";
import { resolveRateForTrip, persistRate } from "@/lib/fx";
import { getUserGlobe } from "@/lib/globe";
import { markerToWishlistItemData } from "@/lib/marker-to-item";
import type { MarkerView } from "@/components/globe/types";
import { type ActionResult, validationResult } from "@/lib/action-result";
import { cleanupTargetSideDataTx } from "@/server/actions/target-cleanup";
import { deleteOwnedCostsTx } from "@/server/actions/owned-costs";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ItemActionResult = ActionResult;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Look up an item and verify the current user has access to its trip.
 * Returns the item (with tripId) or throws notFound().
 */
async function requireItemAccess(itemId: string): Promise<{
  id: string;
  tripId: string;
  forkId: string | null;
}> {
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { id: true, tripId: true, forkId: true },
  });
  if (!item) {
    notFound();
  }
  await requireTripAccess(item.tripId);
  return item;
}

/**
 * Revalidate all relevant trip pages after mutating an item.
 */
function revalidateItemPaths(tripId: string) {
  // "layout" revalidates every nested trip route — including /budget, which
  // inline cost edits reach through this action (things-to-fix P2-4).
  revalidatePath(`/trips/${tripId}`, "layout");
}

/**
 * Load the scheduled Stops of one plan, shaped for `resolveOwningStop`
 * (ADR 0049 rule 4). Every call site that moves or places an Item onto a
 * date needs this: `stopForDate` alone resolves a Changeover day — one two
 * consecutive Stops both claim — to the arriving Stop, which would silently
 * move an Item's Cost from one Stop's Budget line to the next every time
 * something landed on that shared day. `resolveOwningStop` avoids that by
 * preferring an existing owner that still covers the date, but it needs the
 * full plan-scoped Stop list to check coverage against.
 *
 * `forkId` is a parameter rather than closed over so each call site scopes
 * to its own plan — a Fork placement validates against Fork Stops, a
 * real-plan move against real-plan Stops (`lib/plan-scope.ts`).
 */
async function loadPlanStopsForOwnership(
  tripId: string,
  forkId: string | null,
): Promise<ItineraryStop[]> {
  const rows = await db.stop.findMany({
    // Only scheduled stops can cover a calendar day.
    where: { tripId, ...planScope(forkId), arriveDate: { not: null } },
    select: { id: true, name: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name ?? "",
    timezone: s.timezone ?? "UTC",
    arriveDate: s.arriveDate!,
    departDate: s.departDate!,
    sortOrder: s.sortOrder,
  }));
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a new item.
 *
 * - Validates input via itemSchema.
 * - If stopId is provided, verifies it belongs to the trip.
 * - sortOrder = max existing sortOrder in the trip + 1.
 */
export async function createItem(
  tripId: string,
  input: ItemInput,
  forkId?: PlanId,
): Promise<ItemActionResult> {
  await requireTripAccess(tripId);

  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const data = parsed.data;

  // Validate stopId belongs to this trip and the same plan
  if (data.stopId) {
    const stop = await db.stop.findUnique({
      where: { id: data.stopId },
      select: { id: true, tripId: true, forkId: true },
    });
    if (!stop || stop.tripId !== tripId || stop.forkId !== (forkId ?? null)) {
      return {
        success: false,
        errors: { stopId: ["Stop does not belong to this trip"] },
      };
    }
  }

  // Sort order: max + 1 within the target plan
  const maxItem = await db.item.findFirst({
    where: { tripId, ...planScope(forkId) },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxItem?.sortOrder ?? -1) + 1;

  // Best-effort geocode from address
  let lat: number | null = null;
  let lng: number | null = null;
  let countryCode: string | null = null;
  if (data.address) {
    const candidate = await geocodePlaceDetailed(data.address);
    lat = candidate?.lat ?? null;
    lng = candidate?.lng ?? null;
    countryCode = candidate?.countryCode?.toLowerCase() ?? null;
  }

  const created = await db.item.create({
    data: {
      tripId,
      forkId: forkId ?? null,
      stopId: data.stopId ?? null,
      title: data.title,
      category: data.category,
      date: data.date ?? null,
      startTime: data.startTime ?? null,
      endTime: data.endTime ?? null,
      address: data.address ?? null,
      link: data.link ?? null,
      booking: data.booking ?? null,
      notes: data.notes ?? null,
      lat,
      lng,
      countryCode,
      sortOrder,
    },
  });

  // If an inline cost was supplied, create a single item-owned Cost.
  // Resolve the FX rate BEFORE opening a transaction (network must not hold a
  // DB transaction open — ADR 0007).
  if (data.costMinor !== undefined && data.currency) {
    const trip = await db.trip.findUnique({
      where: { id: tripId },
      select: { homeCurrency: true },
    });
    if (trip) {
      const resolved = await resolveRateForTrip(tripId, data.currency, trip.homeCurrency, { db });
      await db.$transaction(async (tx) => {
        if (resolved.persist) {
          await persistRate(tx, tripId, resolved.persist);
        }
        await (tx as typeof db).cost.create({
          data: {
            tripId,
            forkId: forkId ?? null,
            ownerType: "ITEM",
            ownerId: created.id,
            costMinor: data.costMinor!,
            paidMinor: data.paidMinor ?? null,
            currency: data.currency!,
            rateToHome: resolved.rate,
            paidAt: data.paidAt ? new Date(data.paidAt) : null,
            label: null,
            category: null,
          },
        });
      });
    }
  }

  await recordPlanActivity(forkId, { tripId, verb: "CREATED", entityType: "ITEM", entityId: created.id, entityLabel: entityLabel("ITEM", created as unknown as Record<string, unknown>) });
  revalidateItemPaths(tripId);
  return { success: true };
}

/**
 * Seed a Trip's Wishlist from a Globe Marker (ADR 0025).
 *
 * - Verifies the caller has access to the trip AND that the Marker lives on the
 *   caller's own Globe (a user is in at most one).
 * - Idempotent: if an unscheduled wishlist Item in this trip already points at
 *   this Marker, returns success without creating a duplicate.
 * - Otherwise copies the Marker into a new wishlist idea (forkId/stopId/date all
 *   null), records provenance via sourceMarkerId, and logs the same activity as
 *   a manual wishlist add.
 */
export async function addMarkerToWishlist(
  markerId: string,
  tripId: string,
): Promise<ItemActionResult> {
  const { user } = await requireTripAccess(tripId);

  const globe = await getUserGlobe(user.id);
  if (!globe) {
    return { success: false, errors: { marker: ["You are not part of a Globe."] } };
  }

  const marker = await db.marker.findUnique({
    where: { id: markerId },
    select: {
      id: true, globeId: true, title: true, category: true, note: true, link: true,
      timing: true, lat: true, lng: true, city: true, country: true, countryCode: true,
    },
  });
  if (!marker || marker.globeId !== globe.id) {
    return { success: false, errors: { marker: ["Marker not found on your Globe."] } };
  }

  // Idempotency: already pulled into this trip's wishlist?
  const existing = await db.item.findFirst({
    where: { tripId, forkId: null, stopId: null, date: null, sourceMarkerId: markerId },
    select: { id: true },
  });
  if (existing) return { success: true };

  const maxItem = await db.item.findFirst({
    where: { tripId, ...planScope(null) },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxItem?.sortOrder ?? -1) + 1;

  const seed = markerToWishlistItemData(marker as unknown as MarkerView);
  const created = await db.item.create({
    data: {
      tripId,
      forkId: null,
      stopId: null,
      date: null,
      sourceMarkerId: markerId,
      title: seed.title,
      category: seed.category,
      lat: seed.lat,
      lng: seed.lng,
      countryCode: seed.countryCode,
      address: seed.address,
      link: seed.link,
      notes: seed.notes,
      sortOrder,
    },
  });

  await recordPlanActivity(null, {
    tripId,
    verb: "CREATED",
    entityType: "ITEM",
    entityId: created.id,
    entityLabel: entityLabel("ITEM", created as unknown as Record<string, unknown>),
  });
  revalidateItemPaths(tripId);
  return { success: true };
}

/**
 * Update an existing item.
 *
 * - Access-checked via requireItemAccess → requireTripAccess.
 * - If stopId changed, validates it still belongs to the same trip.
 */
export async function updateItem(
  itemId: string,
  input: ItemInput,
): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);

  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const data = parsed.data;

  // Validate stopId belongs to this trip and to the item's own plan.
  if (data.stopId) {
    const stop = await db.stop.findUnique({
      where: { id: data.stopId },
      select: { id: true, tripId: true, forkId: true },
    });
    if (!stop || stop.tripId !== item.tripId || stop.forkId !== item.forkId) {
      return {
        success: false,
        errors: { stopId: ["Stop does not belong to this trip"] },
      };
    }
  }

  const before = await db.item.findUnique({ where: { id: itemId } });

  // Best-effort geocode from address
  let lat: number | null = null;
  let lng: number | null = null;
  let countryCode: string | null = null;
  if (data.address) {
    const candidate = await geocodePlaceDetailed(data.address);
    lat = candidate?.lat ?? null;
    lng = candidate?.lng ?? null;
    countryCode = candidate?.countryCode?.toLowerCase() ?? null;
  }

  const updated = await db.item.update({
    where: { id: itemId },
    data: {
      stopId: data.stopId ?? null,
      title: data.title,
      category: data.category,
      date: data.date ?? null,
      startTime: data.startTime ?? null,
      endTime: data.endTime ?? null,
      address: data.address ?? null,
      link: data.link ?? null,
      booking: data.booking ?? null,
      notes: data.notes ?? null,
      lat,
      lng,
      countryCode,
    },
  });

  // Inline cost management (mirrors transport cost logic):
  // 0 existing costs + amount provided → create
  // 1 existing cost + amount provided → update it
  // >1 existing costs → leave CostEditor authoritative (never clobber)
  // No amount provided → skip
  if (data.costMinor !== undefined && data.currency) {
    const existingCosts = await db.cost.findMany({
      where: { ownerType: "ITEM", ownerId: itemId },
      select: { id: true },
    });

    if (existingCosts.length <= 1) {
      const trip = await db.trip.findUnique({
        where: { id: item.tripId },
        select: { homeCurrency: true },
      });
      if (trip) {
        const resolved = await resolveRateForTrip(item.tripId, data.currency, trip.homeCurrency, { db });
        await db.$transaction(async (tx) => {
          if (resolved.persist) {
            await persistRate(tx, item.tripId, resolved.persist);
          }
          if (existingCosts.length === 0) {
            await (tx as typeof db).cost.create({
              data: {
                tripId: item.tripId,
                forkId: item.forkId ?? null,
                ownerType: "ITEM",
                ownerId: itemId,
                costMinor: data.costMinor!,
                paidMinor: data.paidMinor ?? null,
                currency: data.currency!,
                rateToHome: resolved.rate,
                paidAt: data.paidAt ? new Date(data.paidAt) : null,
                label: null,
                category: null,
              },
            });
          } else {
            // exactly 1 existing cost. paidMinor is included only when the
            // caller actually provided a value — un-ticking Paid sends
            // paidMinor: undefined (never null) so the paid amount survives
            // as history (CONTEXT.md "Paid"); omitting the key here leaves
            // Prisma's existing value untouched instead of nulling it out.
            await (tx as typeof db).cost.update({
              where: { id: existingCosts[0].id },
              data: {
                costMinor: data.costMinor!,
                currency: data.currency!,
                rateToHome: resolved.rate,
                paidAt: data.paidAt ? new Date(data.paidAt) : null,
                ...(data.paidMinor !== undefined && { paidMinor: data.paidMinor }),
              },
            });
          }
        });
      }
    }
    // >1 costs: do nothing — CostEditor is authoritative
  }

  await recordPlanActivity(item.forkId, {
    tripId: item.tripId,
    verb: "UPDATED",
    entityType: "ITEM",
    entityId: itemId,
    entityLabel: entityLabel("ITEM", updated as unknown as Record<string, unknown>),
    changes: describeChanges("ITEM", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });
  revalidateItemPaths(item.tripId);
  return { success: true };
}

/**
 * Delete an item.
 */
export async function deleteItem(itemId: string): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);

  const doomed = await db.item.findUnique({ where: { id: itemId }, select: { title: true } });

  // cleanupTargetSideDataTx schedules attachment blobs for retention inside
  // this same transaction (ARCH-DAT-3) — no post-commit blob call needed.
  await db.$transaction(async (tx) => {
    await tx.item.delete({ where: { id: itemId } });
    await deleteOwnedCostsTx(tx, item.tripId, [
      { type: "ITEM", id: itemId, label: doomed?.title ?? "Item" },
    ]);
    await cleanupTargetSideDataTx(tx, item.tripId, "ITEM", itemId);
  });

  await recordPlanActivity(item.forkId, { tripId: item.tripId, verb: "DELETED", entityType: "ITEM", entityId: itemId, entityLabel: doomed?.title ?? "" });

  revalidateItemPaths(item.tripId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Scheduling actions
// ---------------------------------------------------------------------------

const scheduleDateSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format")
      .optional(),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format")
      .optional(),
  })
  .refine(
    (data) => {
      if (data.endTime && !data.startTime) return false;
      return true;
    },
    {
      message: "Start time is required when an end time is set",
      path: ["startTime"],
    },
  )
  .refine(
    (data) => {
      if (data.startTime && data.endTime && data.endTime < data.startTime)
        return false;
      return true;
    },
    {
      message: "End time must be on or after start time",
      path: ["endTime"],
    },
  );

export type ScheduleItemInput = z.infer<typeof scheduleDateSchema>;

/**
 * Schedule an item onto the timeline (ADR 0019 copy-in semantics).
 *
 * - If the target is a Wishlist idea (date===null && forkId===null): CREATE a
 *   placed copy in the target plan (forkId param), setting sourceItemId to the
 *   idea's id. The idea row is left untouched.
 * - If the target already has a date (it's a placed/scheduled item): keep the
 *   existing in-place reschedule behaviour (update date/startTime/endTime).
 *
 * The date is allowed to be outside the trip date range — this is a soft rule;
 * we store it as-is and the UI can warn.
 */
export async function scheduleItem(
  itemId: string,
  input: ScheduleItemInput,
  forkId?: PlanId,
): Promise<ActionResult<{ placedItemId?: string }>> {
  const accessItem = await requireItemAccess(itemId);

  const parsed = scheduleDateSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const { date, startTime, endTime } = parsed.data;

  // Fetch the full item row to determine which branch to take.
  const fullItem = await db.item.findUnique({ where: { id: itemId } });
  if (!fullItem) notFound();

  const isWishlistIdea =
    fullItem.date === null && fullItem.stopId === null && fullItem.forkId === null;

  if (isWishlistIdea) {
    // --- Copy-in placement branch ---
    // Compute sortOrder scoped to the target plan (highest existing placed sortOrder + 1).
    const maxPlaced = await db.item.findFirst({
      where: {
        tripId: accessItem.tripId,
        ...planScope(forkId),
        date: { not: null },
      },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = (maxPlaced?.sortOrder ?? -1) + 1;

    // A placed copy is dated, so it sits inside some Stop's stay and must be
    // filed there — otherwise it is invisible in the plan editor's day rows
    // and its Cost rolls up as "Trip-wide / Other" rather than against the
    // Stop it happens in (ADR 0049 rule 5). A Wishlist idea by definition
    // carries no Stop, so there is no prior owner to preserve and a
    // Changeover day simply yields the arriving Stop.
    const planStops = await loadPlanStopsForOwnership(accessItem.tripId, forkId ?? null);
    const placedStopId = resolveOwningStop(null, date, planStops);

    const placed = await db.item.create({
      data: {
        tripId: accessItem.tripId,
        forkId: forkId ?? null,
        sourceItemId: itemId,
        title: fullItem.title,
        category: fullItem.category,
        stopId: placedStopId,
        lat: fullItem.lat ?? null,
        lng: fullItem.lng ?? null,
        countryCode: fullItem.countryCode ?? null,
        address: fullItem.address ?? null,
        link: fullItem.link ?? null,
        notes: fullItem.notes ?? null,
        date,
        startTime: startTime ?? null,
        endTime: endTime ?? null,
        sortOrder,
      },
    });

    await recordPlanActivity(forkId, {
      tripId: accessItem.tripId,
      verb: "CREATED",
      entityType: "ITEM",
      entityId: placed.id,
      entityLabel: entityLabel("ITEM", placed as unknown as Record<string, unknown>),
    });

    revalidateItemPaths(accessItem.tripId);
    return { success: true, placedItemId: placed.id };
  }

  // --- In-place reschedule branch (item already has a date) ---
  // Reuse fullItem as the before snapshot — it's the same row read above.
  const before = fullItem;

  // Writing `stopId` here (ADR 0049 rule 4) is what lets the plan editor hand
  // a move straight to this action instead of hand-guarding against
  // `stopForDate`'s later-Stop tiebreak on a Changeover day.
  const planStops = await loadPlanStopsForOwnership(accessItem.tripId, fullItem.forkId);
  const owningStopId = resolveOwningStop(fullItem.stopId ?? null, date, planStops);

  const updated = await db.item.update({
    where: { id: itemId },
    data: {
      date,
      stopId: owningStopId,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
    },
  });

  await recordPlanActivity(accessItem.forkId, {
    tripId: accessItem.tripId,
    verb: "UPDATED",
    entityType: "ITEM",
    entityId: itemId,
    entityLabel: entityLabel("ITEM", updated as unknown as Record<string, unknown>),
    changes: describeChanges("ITEM", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });

  revalidateItemPaths(accessItem.tripId);
  return { success: true };
}

export type UnscheduleResult = ActionResult<{
  /** "placement-removed": row was a placed copy and was deleted (idea survives).
   *  "unslotted": direct-created item; its date was cleared in place. */
  mode: "placement-removed" | "unslotted";
  sourceItemId: string | null;
}>;

/**
 * Unschedule a placed item (ADR 0019 / grilling 2026-09-07).
 *
 * - Placed copy (sourceItemId set): delete only the placement; the idea
 *   survives in the Wishlist.
 * - Direct-created (sourceItemId null): clear the date in place. With a
 *   stopId the item un-slots to that Stop's things-to-do (ADR 0038); with
 *   none it returns to the Wishlist pool. Times are kept — harmless while
 *   undated, and they make undo lossless.
 */
export async function unscheduleItem(itemId: string): Promise<UnscheduleResult> {
  const accessItem = await requireItemAccess(itemId);

  const fullItem = await db.item.findUnique({ where: { id: itemId } });
  if (!fullItem) notFound();

  let mode: "placement-removed" | "unslotted";
  if (fullItem.sourceItemId !== null) {
    // cleanupTargetSideDataTx schedules attachment blobs for retention inside
    // this same transaction (ARCH-DAT-3) — no post-commit blob call needed.
    await db.$transaction(async (tx) => {
      await tx.item.delete({ where: { id: itemId } });
      await deleteOwnedCostsTx(tx, accessItem.tripId, [
        { type: "ITEM", id: itemId, label: fullItem.title ?? "Item" },
      ]);
      await cleanupTargetSideDataTx(tx, accessItem.tripId, "ITEM", itemId);
    });
    mode = "placement-removed";
  } else {
    await db.item.update({ where: { id: itemId }, data: { date: null } });
    mode = "unslotted";
  }

  await recordPlanActivity(accessItem.forkId, {
    tripId: accessItem.tripId,
    verb: mode === "placement-removed" ? "DELETED" : "UPDATED",
    entityType: "ITEM",
    entityId: itemId,
    entityLabel: entityLabel("ITEM", fullItem as unknown as Record<string, unknown>),
  });

  revalidateItemPaths(accessItem.tripId);
  return { success: true, mode, sourceItemId: fullItem.sourceItemId ?? null };
}

// ---------------------------------------------------------------------------
// Rescheduling
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Move an item to `targetDateISO`, resolving its owning stop via
 * `resolveOwningStop` (ADR 0049 rule 4) — kept if it still covers the day,
 * otherwise re-filed to whichever stop does (null on a gap day). Keeps the
 * item's existing start/end time. Used by month-grid drag-to-reschedule.
 * Rejects dates outside the trip window.
 */
export async function rescheduleItem(
  itemId: string,
  targetDateISO: string,
): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);

  if (!ISO_DATE_RE.test(targetDateISO)) {
    return { success: false, errors: { date: ["Date must be in YYYY-MM-DD format"] } };
  }

  const trip = await db.trip.findUnique({
    where: { id: item.tripId },
    select: { startDate: true, endDate: true },
  });
  if (!trip) notFound();

  // A date-less trip has no calendar window to reschedule onto.
  if (!trip.startDate || !trip.endDate) {
    return { success: false, errors: { date: ["This trip has no dates yet."] } };
  }

  if (targetDateISO < trip.startDate || targetDateISO > trip.endDate) {
    return { success: false, errors: { date: ["That day is outside the trip."] } };
  }

  // Read before resolving ownership, not after: resolveOwningStop needs
  // before.stopId, and nothing between here and the update touches this
  // item, so the snapshot it yields is the same pre-update state either way.
  const before = await db.item.findUnique({ where: { id: itemId } });

  const planStops = await loadPlanStopsForOwnership(item.tripId, item.forkId);

  // Ownership follows ADR 0049 rule 4: keep the owning Stop while it still
  // covers the date, re-filing only when the move leaves that Stop's stay.
  const owningStopId = resolveOwningStop(before?.stopId ?? null, targetDateISO, planStops);

  const updated = await db.item.update({
    where: { id: itemId },
    data: { date: targetDateISO, stopId: owningStopId },
  });

  await recordPlanActivity(item.forkId, {
    tripId: item.tripId,
    verb: "UPDATED",
    entityType: "ITEM",
    entityId: itemId,
    entityLabel: entityLabel("ITEM", updated as unknown as Record<string, unknown>),
    changes: describeChanges("ITEM", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });

  revalidateItemPaths(item.tripId);
  return { success: true };
}
