"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { itemSchema, type ItemInput } from "@/lib/validations/item";
import { stopForDate } from "@/lib/itinerary";
import { geocodePlace } from "@/lib/geocode";
import { recordPlanActivity } from "@/lib/activity-guard";
import { entityLabel, describeChanges } from "@/lib/activity";
import { planScope, type PlanId } from "@/lib/plan-scope";
import { resolveRateForTrip, persistRate } from "@/lib/fx";
import { getUserGlobe } from "@/lib/globe";
import { markerToWishlistItemData } from "@/lib/marker-to-item";
import type { MarkerView } from "@/components/globe/types";
import { type ActionResult, validationResult } from "@/lib/action-result";

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
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/wishlist`);
  revalidatePath(`/trips/${tripId}/calendar`);
  revalidatePath(`/trips/${tripId}/plan`);
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
  if (data.address) {
    const coords = await geocodePlace(data.address);
    lat = coords?.lat ?? null;
    lng = coords?.lng ?? null;
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
      sortOrder,
    },
  });

  // If an inline cost was supplied, create a single item-owned Cost.
  // Resolve the FX rate BEFORE opening a transaction (network must not hold a
  // DB transaction open — ADR 0007).
  if (data.estimatedMinor !== undefined && data.currency) {
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
            estimatedMinor: data.estimatedMinor!,
            actualMinor: data.actualMinor ?? null,
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
  if (data.address) {
    const coords = await geocodePlace(data.address);
    lat = coords?.lat ?? null;
    lng = coords?.lng ?? null;
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
    },
  });

  // Inline cost management (mirrors transport cost logic):
  // 0 existing costs + amount provided → create
  // 1 existing cost + amount provided → update it
  // >1 existing costs → leave CostEditor authoritative (never clobber)
  // No amount provided → skip
  if (data.estimatedMinor !== undefined && data.currency) {
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
                estimatedMinor: data.estimatedMinor!,
                actualMinor: data.actualMinor ?? null,
                currency: data.currency!,
                rateToHome: resolved.rate,
                paidAt: data.paidAt ? new Date(data.paidAt) : null,
                label: null,
                category: null,
              },
            });
          } else {
            // exactly 1 existing cost
            await (tx as typeof db).cost.update({
              where: { id: existingCosts[0].id },
              data: {
                estimatedMinor: data.estimatedMinor!,
                actualMinor: data.actualMinor ?? null,
                currency: data.currency!,
                rateToHome: resolved.rate,
                paidAt: data.paidAt ? new Date(data.paidAt) : null,
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
  await db.item.delete({ where: { id: itemId } });
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

  const isWishlistIdea = fullItem.date === null && fullItem.forkId === null;

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

    const placed = await db.item.create({
      data: {
        tripId: accessItem.tripId,
        forkId: forkId ?? null,
        sourceItemId: itemId,
        title: fullItem.title,
        category: fullItem.category,
        stopId: fullItem.stopId ?? null,
        lat: fullItem.lat ?? null,
        lng: fullItem.lng ?? null,
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

  const updated = await db.item.update({
    where: { id: itemId },
    data: {
      date,
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

/**
 * Unschedule (remove) a placed item (ADR 0019 copy-in semantics).
 *
 * Deletes the placed copy. The originating wishlist idea (if any) is left
 * intact. Directly-created timeline items (sourceItemId===null) are also
 * deleted — they have no idea to fall back to ("remove from timeline").
 */
export async function unscheduleItem(
  itemId: string,
): Promise<ItemActionResult> {
  const accessItem = await requireItemAccess(itemId);

  // Fetch the full item so we have its title for the activity log.
  const fullItem = await db.item.findUnique({ where: { id: itemId } });
  if (!fullItem) notFound();

  await db.item.delete({ where: { id: itemId } });

  await recordPlanActivity(accessItem.forkId, {
    tripId: accessItem.tripId,
    verb: "DELETED",
    entityType: "ITEM",
    entityId: itemId,
    entityLabel: entityLabel("ITEM", fullItem as unknown as Record<string, unknown>),
  });

  revalidateItemPaths(accessItem.tripId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Rescheduling
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Move an item to `targetDateISO`, reassigning its stop to whichever stop covers
 * that day (null on a gap day). Keeps the item's existing start/end time. Used by
 * month-grid drag-to-reschedule and wishlist→day drops. Rejects dates outside the
 * trip window.
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

  const stops = await db.stop.findMany({
    // Only scheduled stops can cover a calendar day.
    // Scope to the same plan as the item being rescheduled so fork placements
    // validate against fork stops, and real-plan moves against real-plan stops.
    where: { tripId: item.tripId, ...planScope(item.forkId), arriveDate: { not: null } },
    select: { id: true, name: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true },
  });

  const covering = stopForDate(
    stops.map((s) => ({
      id: s.id,
      name: s.name ?? "",
      timezone: s.timezone ?? "UTC",
      arriveDate: s.arriveDate!,
      departDate: s.departDate!,
      sortOrder: s.sortOrder,
    })),
    targetDateISO,
  );

  const before = await db.item.findUnique({ where: { id: itemId } });

  const updated = await db.item.update({
    where: { id: itemId },
    data: { date: targetDateISO, stopId: covering?.id ?? null },
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
