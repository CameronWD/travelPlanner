"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { transportSchema, type TransportInput } from "@/lib/validations/transport";
import { geocodePlace } from "@/lib/geocode";
import { recordPlanActivity } from "@/lib/activity-guard";
import { entityLabel, describeChanges } from "@/lib/activity";
import { planScope, type PlanId } from "@/lib/plan-scope";
import { resolveRateForTrip, persistRate } from "@/lib/fx";
import { type ActionResult, validationResult } from "@/lib/action-result";
import { cleanupTargetSideData } from "@/server/actions/target-cleanup";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type TransportActionResult = ActionResult;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Look up a transport and verify the current user has access to its trip.
 * Returns the transport (with its tripId) or throws notFound().
 */
async function requireTransportAccess(transportId: string): Promise<{
  id: string;
  tripId: string;
  forkId: string | null;
}> {
  const transport = await db.transport.findUnique({
    where: { id: transportId },
    select: { id: true, tripId: true, forkId: true },
  });
  if (!transport) {
    notFound();
  }
  await requireTripAccess(transport.tripId);
  return transport;
}

/**
 * If fromStopId or toStopId are provided, verify they belong to `tripId` and the same plan.
 * Returns an error result if validation fails, null if ok.
 */
async function validateStopBelongsToTrip(
  tripId: string,
  stopIds: (string | undefined | null)[],
  forkId?: PlanId,
): Promise<TransportActionResult | null> {
  const ids = stopIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return null;

  const targetForkId = forkId ?? null;
  const stops = await db.stop.findMany({
    where: { id: { in: ids }, ...planScope(forkId) },
    select: { id: true, tripId: true, forkId: true },
  });

  for (const id of ids) {
    const stop = stops.find((s) => s.id === id);
    if (!stop || stop.tripId !== tripId || stop.forkId !== targetForkId) {
      return {
        success: false,
        errors: {
          _form: ["Selected stop does not belong to this trip"],
        },
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a new transport for a trip.
 *
 * sortOrder = max existing + 1.
 * If fromStopId/toStopId are provided they must belong to the same trip.
 */
export async function createTransport(
  tripId: string,
  input: TransportInput,
  forkId?: PlanId,
): Promise<TransportActionResult> {
  await requireTripAccess(tripId);

  const parsed = transportSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const data = parsed.data;

  // Normalise home-base flags: a home endpoint owns no stop and no free-text
  // place. Its coordinates resolve from the trip at read time.
  const depIsHome = data.depIsHome ?? false;
  const arrIsHome = data.arrIsHome ?? false;
  const depPlace = depIsHome ? null : (data.depPlace || null);
  const arrPlace = arrIsHome ? null : (data.arrPlace || null);

  // Normalise empty stop IDs to null (also cleared when home flag is set)
  const fromStopId = depIsHome ? null : (data.fromStopId || null);
  const toStopId = arrIsHome ? null : (data.toStopId || null);

  // Validate stop ownership (same plan)
  const stopError = await validateStopBelongsToTrip(tripId, [fromStopId, toStopId], forkId);
  if (stopError) return stopError;

  // Determine sort order
  const maxTransport = await db.transport.findFirst({
    where: { tripId, ...planScope(forkId) },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxTransport?.sortOrder ?? -1) + 1;

  // Best-effort geocode for departure and arrival places.
  // Home endpoints are not geocoded — coords resolve from the trip at read time.
  let depLat: number | null = null;
  let depLng: number | null = null;
  if (depPlace) {
    const coords = await geocodePlace(depPlace);
    depLat = coords?.lat ?? null;
    depLng = coords?.lng ?? null;
  }

  let arrLat: number | null = null;
  let arrLng: number | null = null;
  if (arrPlace) {
    const coords = await geocodePlace(arrPlace);
    arrLat = coords?.lat ?? null;
    arrLng = coords?.lng ?? null;
  }

  const created = await db.transport.create({
    data: {
      tripId,
      forkId: forkId ?? null,
      mode: data.mode,
      depIsHome,
      arrIsHome,
      fromStopId,
      toStopId,
      depPlace,
      depAt: data.depAt ?? null,
      arrPlace,
      arrAt: data.arrAt ?? null,
      reference: data.reference ?? null,
      notes: data.notes ?? null,
      sortOrder,
      depLat,
      depLng,
      arrLat,
      arrLng,
    },
  });

  // If an inline cost was supplied, create a single transport-owned Cost.
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
            ownerType: "TRANSPORT",
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

  await recordPlanActivity(forkId, { tripId, verb: "CREATED", entityType: "TRANSPORT", entityId: created.id, entityLabel: entityLabel("TRANSPORT", created as unknown as Record<string, unknown>) });
  revalidatePath(`/trips/${tripId}`, "layout");
  return { success: true };
}

/**
 * Update an existing transport.
 *
 * Looks up the transport → requireTripAccess(transport.tripId).
 */
export async function updateTransport(
  transportId: string,
  input: TransportInput,
): Promise<TransportActionResult> {
  const transport = await requireTransportAccess(transportId);

  const parsed = transportSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const data = parsed.data;

  // Normalise home-base flags: a home endpoint owns no stop and no free-text
  // place. Its coordinates resolve from the trip at read time.
  const depIsHome = data.depIsHome ?? false;
  const arrIsHome = data.arrIsHome ?? false;
  const depPlace = depIsHome ? null : (data.depPlace || null);
  const arrPlace = arrIsHome ? null : (data.arrPlace || null);

  // Normalise empty stop IDs to null (also cleared when home flag is set)
  const fromStopId = depIsHome ? null : (data.fromStopId || null);
  const toStopId = arrIsHome ? null : (data.toStopId || null);

  const stopError = await validateStopBelongsToTrip(
    transport.tripId,
    [fromStopId, toStopId],
    transport.forkId,
  );
  if (stopError) return stopError;

  const before = await db.transport.findUnique({ where: { id: transportId } });

  // Best-effort geocode for departure and arrival places.
  // Home endpoints are not geocoded — coords resolve from the trip at read time.
  let depLat: number | null = null;
  let depLng: number | null = null;
  if (depPlace) {
    const coords = await geocodePlace(depPlace);
    depLat = coords?.lat ?? null;
    depLng = coords?.lng ?? null;
  }

  let arrLat: number | null = null;
  let arrLng: number | null = null;
  if (arrPlace) {
    const coords = await geocodePlace(arrPlace);
    arrLat = coords?.lat ?? null;
    arrLng = coords?.lng ?? null;
  }

  const updated = await db.transport.update({
    where: { id: transportId },
    data: {
      mode: data.mode,
      depIsHome,
      arrIsHome,
      fromStopId,
      toStopId,
      depPlace,
      depAt: data.depAt ?? null,
      arrPlace,
      arrAt: data.arrAt ?? null,
      reference: data.reference ?? null,
      notes: data.notes ?? null,
      depLat,
      depLng,
      arrLat,
      arrLng,
    },
  });

  // Inline cost management:
  // 0 existing costs + amount provided → create
  // 1 existing cost + amount provided → update it
  // >1 existing costs → leave CostEditor authoritative (never clobber)
  // No amount provided → skip
  if (data.estimatedMinor !== undefined && data.currency) {
    const existingCosts = await db.cost.findMany({
      where: { ownerType: "TRANSPORT", ownerId: transportId },
      select: { id: true },
    });

    if (existingCosts.length <= 1) {
      const trip = await db.trip.findUnique({
        where: { id: transport.tripId },
        select: { homeCurrency: true },
      });
      if (trip) {
        const resolved = await resolveRateForTrip(transport.tripId, data.currency, trip.homeCurrency, { db });
        await db.$transaction(async (tx) => {
          if (resolved.persist) {
            await persistRate(tx, transport.tripId, resolved.persist);
          }
          if (existingCosts.length === 0) {
            await (tx as typeof db).cost.create({
              data: {
                tripId: transport.tripId,
                forkId: transport.forkId ?? null,
                ownerType: "TRANSPORT",
                ownerId: transportId,
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

  await recordPlanActivity(transport.forkId, {
    tripId: transport.tripId,
    verb: "UPDATED",
    entityType: "TRANSPORT",
    entityId: transportId,
    entityLabel: entityLabel("TRANSPORT", updated as unknown as Record<string, unknown>),
    changes: describeChanges("TRANSPORT", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });
  revalidatePath(`/trips/${transport.tripId}`, "layout");
  return { success: true };
}

/**
 * Delete a transport.
 */
export async function deleteTransport(
  transportId: string,
): Promise<TransportActionResult> {
  const transport = await requireTransportAccess(transportId);

  const doomed = await db.transport.findUnique({ where: { id: transportId } });
  await db.transport.delete({ where: { id: transportId } });
  await recordPlanActivity(transport.forkId, { tripId: transport.tripId, verb: "DELETED", entityType: "TRANSPORT", entityId: transportId, entityLabel: entityLabel("TRANSPORT", (doomed ?? {}) as unknown as Record<string, unknown>) });

  await cleanupTargetSideData(transport.tripId, "TRANSPORT", transportId);

  revalidatePath(`/trips/${transport.tripId}`, "layout");
  return { success: true };
}
