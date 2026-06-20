"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { stopSchema, type StopInput } from "@/lib/validations/stop";
import { geocodePlace } from "@/lib/geocode";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type StopActionResult =
  | { success: true }
  | { success: false; errors: Record<string, string[]> };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Look up a stop and verify the current user has access to its trip.
 * Returns the stop (with its tripId) or throws notFound().
 */
async function requireStopAccess(stopId: string): Promise<{ id: string; tripId: string; sortOrder: number }> {
  const stop = await db.stop.findUnique({
    where: { id: stopId },
    select: { id: true, tripId: true, sortOrder: true },
  });
  if (!stop) {
    notFound();
  }
  // Also verify the user is a member of the trip
  await requireTripAccess(stop.tripId);
  return stop;
}

function validationErrors(error: { flatten(): { fieldErrors: Record<string, string[] | undefined> } }): StopActionResult {
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
 * Create a new stop in the given trip.
 *
 * If no lat/lng are provided, best-effort geocodes the name+country.
 * sortOrder is set to (max existing + 1).
 */
export async function createStop(
  tripId: string,
  input: StopInput,
): Promise<StopActionResult> {
  await requireTripAccess(tripId);

  const parsed = stopSchema.safeParse(input);
  if (!parsed.success) {
    return validationErrors(parsed.error);
  }

  const { name, country, timezone, arriveDate, departDate, notes } = parsed.data;
  let { lat, lng } = parsed.data;

  // Best-effort geocode if coords are missing
  if (lat === undefined || lng === undefined) {
    const query = [name, country].filter(Boolean).join(", ");
    const coords = await geocodePlace(query);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }
  }

  // Determine sort order
  const maxStop = await db.stop.findFirst({
    where: { tripId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxStop?.sortOrder ?? -1) + 1;

  await db.stop.create({
    data: {
      tripId,
      name,
      country: country ?? null,
      timezone,
      arriveDate,
      departDate,
      lat: lat ?? null,
      lng: lng ?? null,
      notes: notes ?? null,
      sortOrder,
    },
  });

  revalidatePath(`/trips/${tripId}`);
  return { success: true };
}

/**
 * Update an existing stop.
 *
 * Verifies the stop belongs to a trip the user can access.
 * Optionally re-geocodes if lat/lng are still absent.
 */
export async function updateStop(
  stopId: string,
  input: StopInput,
): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);

  const parsed = stopSchema.safeParse(input);
  if (!parsed.success) {
    return validationErrors(parsed.error);
  }

  const { name, country, timezone, arriveDate, departDate, notes } = parsed.data;
  let { lat, lng } = parsed.data;

  // Best-effort geocode if coords are missing on update too
  if (lat === undefined || lng === undefined) {
    const query = [name, country].filter(Boolean).join(", ");
    const coords = await geocodePlace(query);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }
  }

  await db.stop.update({
    where: { id: stopId },
    data: {
      name,
      country: country ?? null,
      timezone,
      arriveDate,
      departDate,
      lat: lat ?? null,
      lng: lng ?? null,
      notes: notes ?? null,
    },
  });

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

/**
 * Delete a stop.
 *
 * Verifies the stop belongs to a trip the user can access.
 */
export async function deleteStop(stopId: string): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);

  await db.stop.delete({ where: { id: stopId } });

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

/**
 * Move a stop up or down in sortOrder by swapping with its adjacent neighbour.
 *
 * 'up' means decreasing sortOrder (towards the first stop in the list).
 * 'down' means increasing sortOrder (towards the last stop).
 *
 * If there is no adjacent stop in the given direction the action is a no-op.
 */
export async function moveStop(
  stopId: string,
  direction: "up" | "down",
): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);

  // Find all stops for this trip ordered by sortOrder
  const siblings = await db.stop.findMany({
    where: { tripId: stop.tripId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });

  const idx = siblings.findIndex((s) => s.id === stopId);
  if (idx === -1) return { success: true }; // shouldn't happen

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) {
    // No neighbour — no-op
    return { success: true };
  }

  const current = siblings[idx];
  const neighbour = siblings[swapIdx];

  // Swap sort orders in a transaction
  await db.$transaction([
    db.stop.update({
      where: { id: current.id },
      data: { sortOrder: neighbour.sortOrder },
    }),
    db.stop.update({
      where: { id: neighbour.id },
      data: { sortOrder: current.sortOrder },
    }),
  ]);

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}
