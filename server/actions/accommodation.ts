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
import { recordActivity } from "@/server/actions/activity";
import { entityLabel, describeChanges } from "@/lib/activity";
import { REAL_PLAN } from "@/lib/plan-scope";

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
}> {
  const acc = await db.accommodation.findUnique({
    where: { id: accommodationId },
    select: { id: true, tripId: true },
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
): Promise<AccommodationActionResult> {
  const parsed = accommodationSchema.safeParse(input);
  if (!parsed.success) {
    return validationErrors(parsed.error);
  }

  const data = parsed.data;

  // Look up the stop to get the tripId (must be a real-plan stop)
  const stop = await db.stop.findUnique({
    where: { id: data.stopId },
    select: { id: true, tripId: true, forkId: true },
  });
  if (!stop || stop.forkId !== REAL_PLAN.forkId) {
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

  await recordActivity({ tripId: stop.tripId, verb: "CREATED", entityType: "ACCOMMODATION", entityId: created.id, entityLabel: entityLabel("ACCOMMODATION", created as unknown as Record<string, unknown>) });
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

  // Ensure the new stopId still belongs to the same trip (and is a real-plan stop)
  const stop = await db.stop.findUnique({
    where: { id: data.stopId },
    select: { id: true, tripId: true, forkId: true },
  });
  if (!stop || stop.tripId !== acc.tripId || stop.forkId !== REAL_PLAN.forkId) {
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

  await recordActivity({
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
  await recordActivity({ tripId: acc.tripId, verb: "DELETED", entityType: "ACCOMMODATION", entityId: accommodationId, entityLabel: doomed?.name ?? "" });

  revalidatePath(`/trips/${acc.tripId}`);
  return { success: true };
}
