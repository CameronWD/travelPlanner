"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import {
  accommodationSchema,
  type AccommodationInput,
} from "@/lib/validations/accommodation";

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

  // Look up the stop to get the tripId
  const stop = await db.stop.findUnique({
    where: { id: data.stopId },
    select: { id: true, tripId: true },
  });
  if (!stop) {
    return {
      success: false,
      errors: { stopId: ["Stop not found"] },
    };
  }

  // Access check via the trip
  await requireTripAccess(stop.tripId);

  await db.accommodation.create({
    data: {
      tripId: stop.tripId,
      stopId: data.stopId,
      name: data.name,
      address: data.address ?? null,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      confirmation: data.confirmation ?? null,
      notes: data.notes ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    },
  });

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

  // Ensure the new stopId still belongs to the same trip
  const stop = await db.stop.findUnique({
    where: { id: data.stopId },
    select: { id: true, tripId: true },
  });
  if (!stop || stop.tripId !== acc.tripId) {
    return {
      success: false,
      errors: { stopId: ["Stop does not belong to this trip"] },
    };
  }

  await db.accommodation.update({
    where: { id: accommodationId },
    data: {
      stopId: data.stopId,
      name: data.name,
      address: data.address ?? null,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      confirmation: data.confirmation ?? null,
      notes: data.notes ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    },
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

  await db.accommodation.delete({ where: { id: accommodationId } });

  revalidatePath(`/trips/${acc.tripId}`);
  return { success: true };
}
