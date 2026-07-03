"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import {
  accommodationSchema,
  type AccommodationInput,
} from "@/lib/validations/accommodation";
import { geocodePlace } from "@/lib/geocode";
import { recordPlanActivity } from "@/lib/activity-guard";
import { entityLabel, describeChanges } from "@/lib/activity";
import { type PlanId } from "@/lib/plan-scope";
import { resolveRateForTrip, persistRate } from "@/lib/fx";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type AccommodationActionResult =
  | { success: true }
  | { success: false; errors: Record<string, string[]> };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Look up an accommodation → look up its stop → requireTripAccess(stop.tripId).
 * Returns the accommodation with tripId, or notFound().
 */
async function requireAccommodationAccess(accommodationId: string): Promise<{
  id: string;
  tripId: string;
  forkId: string | null;
}> {
  const acc = await db.accommodation.findUnique({
    where: { id: accommodationId },
    select: { id: true, tripId: true, forkId: true },
  });
  if (!acc) {
    notFound();
  }
  await requireTripAccess(acc.tripId);
  return acc;
}

function validationErrors(
  error: { flatten(): { fieldErrors: Record<string, string[] | undefined> } },
): AccommodationActionResult {
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, msgs] of Object.entries(error.flatten().fieldErrors)) {
    fieldErrors[key] = msgs ?? [];
  }
  return { success: false, errors: fieldErrors };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a new accommodation.
 *
 * Derives tripId from the stop's trip; access-checks via that trip.
 */
export async function createAccommodation(
  input: AccommodationInput,
  forkId?: PlanId,
): Promise<AccommodationActionResult> {
  const parsed = accommodationSchema.safeParse(input);
  if (!parsed.success) {
    return validationErrors(parsed.error);
  }

  const data = parsed.data;

  // Look up the stop to get the tripId (must belong to the same plan)
  const stop = await db.stop.findUnique({
    where: { id: data.stopId },
    select: { id: true, tripId: true, forkId: true },
  });
  if (!stop || stop.forkId !== (forkId ?? null)) {
    return {
      success: false,
      errors: { stopId: ["Stop not found"] },
    };
  }

  // Access check via the trip
  await requireTripAccess(stop.tripId);

  // Best-effort geocode from address
  let lat: number | null = null;
  let lng: number | null = null;
  if (data.address) {
    const coords = await geocodePlace(data.address);
    lat = coords?.lat ?? null;
    lng = coords?.lng ?? null;
  }

  const created = await db.accommodation.create({
    data: {
      tripId: stop.tripId,
      forkId: forkId ?? null,
      stopId: data.stopId,
      name: data.name,
      address: data.address ?? null,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      confirmation: data.confirmation ?? null,
      notes: data.notes ?? null,
      lat,
      lng,
    },
  });

  // If an inline cost was supplied, create a single accommodation-owned Cost.
  // Resolve the FX rate BEFORE opening a transaction (network must not hold a
  // DB transaction open — ADR 0007).
  if (data.estimatedMinor !== undefined && data.currency) {
    const trip = await db.trip.findUnique({
      where: { id: stop.tripId },
      select: { homeCurrency: true },
    });
    if (trip) {
      const resolved = await resolveRateForTrip(stop.tripId, data.currency, trip.homeCurrency, { db });
      await db.$transaction(async (tx) => {
        if (resolved.persist) {
          await persistRate(tx, stop.tripId, resolved.persist);
        }
        await (tx as typeof db).cost.create({
          data: {
            tripId: stop.tripId,
            forkId: forkId ?? null,
            ownerType: "ACCOMMODATION",
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

  await recordPlanActivity(forkId, { tripId: stop.tripId, verb: "CREATED", entityType: "ACCOMMODATION", entityId: created.id, entityLabel: entityLabel("ACCOMMODATION", created as unknown as Record<string, unknown>) });
  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

/**
 * Update an existing accommodation.
 *
 * Looks up the accommodation → requireTripAccess(acc.tripId).
 */
export async function updateAccommodation(
  accommodationId: string,
  input: AccommodationInput,
): Promise<AccommodationActionResult> {
  const acc = await requireAccommodationAccess(accommodationId);

  const parsed = accommodationSchema.safeParse(input);
  if (!parsed.success) {
    return validationErrors(parsed.error);
  }

  const data = parsed.data;

  // Ensure the new stopId still belongs to the same trip and plan
  const stop = await db.stop.findUnique({
    where: { id: data.stopId },
    select: { id: true, tripId: true, forkId: true },
  });
  if (!stop || stop.tripId !== acc.tripId || stop.forkId !== acc.forkId) {
    return {
      success: false,
      errors: { stopId: ["Stop does not belong to this trip"] },
    };
  }

  const before = await db.accommodation.findUnique({ where: { id: accommodationId } });

  // Best-effort geocode from address
  let lat: number | null = null;
  let lng: number | null = null;
  if (data.address) {
    const coords = await geocodePlace(data.address);
    lat = coords?.lat ?? null;
    lng = coords?.lng ?? null;
  }

  const updated = await db.accommodation.update({
    where: { id: accommodationId },
    data: {
      stopId: data.stopId,
      name: data.name,
      address: data.address ?? null,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      confirmation: data.confirmation ?? null,
      notes: data.notes ?? null,
      lat,
      lng,
    },
  });

  // Inline cost management:
  // 0 existing costs + amount provided → create
  // 1 existing cost + amount provided → update it
  // >1 existing costs → leave CostEditor authoritative (never clobber)
  // No amount provided → skip
  if (data.estimatedMinor !== undefined && data.currency) {
    const existingCosts = await db.cost.findMany({
      where: { ownerType: "ACCOMMODATION", ownerId: accommodationId },
      select: { id: true },
    });

    if (existingCosts.length <= 1) {
      const trip = await db.trip.findUnique({
        where: { id: acc.tripId },
        select: { homeCurrency: true },
      });
      if (trip) {
        const resolved = await resolveRateForTrip(acc.tripId, data.currency, trip.homeCurrency, { db });
        await db.$transaction(async (tx) => {
          if (resolved.persist) {
            await persistRate(tx, acc.tripId, resolved.persist);
          }
          if (existingCosts.length === 0) {
            await (tx as typeof db).cost.create({
              data: {
                tripId: acc.tripId,
                forkId: acc.forkId ?? null,
                ownerType: "ACCOMMODATION",
                ownerId: accommodationId,
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

  await recordPlanActivity(acc.forkId, {
    tripId: acc.tripId,
    verb: "UPDATED",
    entityType: "ACCOMMODATION",
    entityId: accommodationId,
    entityLabel: entityLabel("ACCOMMODATION", updated as unknown as Record<string, unknown>),
    changes: describeChanges("ACCOMMODATION", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });
  revalidatePath(`/trips/${acc.tripId}`);
  return { success: true };
}

/**
 * Delete an accommodation.
 */
export async function deleteAccommodation(
  accommodationId: string,
): Promise<AccommodationActionResult> {
  const acc = await requireAccommodationAccess(accommodationId);

  const doomed = await db.accommodation.findUnique({ where: { id: accommodationId }, select: { name: true } });
  await db.accommodation.delete({ where: { id: accommodationId } });
  await recordPlanActivity(acc.forkId, { tripId: acc.tripId, verb: "DELETED", entityType: "ACCOMMODATION", entityId: accommodationId, entityLabel: doomed?.name ?? "" });

  revalidatePath(`/trips/${acc.tripId}`);
  return { success: true };
}
