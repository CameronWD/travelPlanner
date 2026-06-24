"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { transportSchema, type TransportInput } from "@/lib/validations/transport";
import { geocodePlace } from "@/lib/geocode";
import { recordActivity } from "@/server/actions/activity";
import { entityLabel, describeChanges } from "@/lib/activity";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type TransportActionResult =
  | { success: true }
  | { success: false; errors: Record<string, string[]> };

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
}> {
  const transport = await db.transport.findUnique({
    where: { id: transportId },
    select: { id: true, tripId: true },
  });
  if (!transport) {
    notFound();
  }
  await requireTripAccess(transport.tripId);
  return transport;
}

function validationErrors(
  error: { flatten(): { fieldErrors: Record<string, string[] | undefined> } },
): TransportActionResult {
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, msgs] of Object.entries(error.flatten().fieldErrors)) {
    fieldErrors[key] = msgs ?? [];
  }
  return { success: false, errors: fieldErrors };
}

/**
 * If fromStopId or toStopId are provided, verify they belong to `tripId`.
 * Returns an error result if validation fails, null if ok.
 */
async function validateStopBelongsToTrip(
  tripId: string,
  stopIds: (string | undefined | null)[],
): Promise<TransportActionResult | null> {
  const ids = stopIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return null;

  const stops = await db.stop.findMany({
    where: { id: { in: ids } },
    select: { id: true, tripId: true },
  });

  for (const id of ids) {
    const stop = stops.find((s) => s.id === id);
    if (!stop || stop.tripId !== tripId) {
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
): Promise<TransportActionResult> {
  await requireTripAccess(tripId);

  const parsed = transportSchema.safeParse(input);
  if (!parsed.success) {
    return validationErrors(parsed.error);
  }

  const data = parsed.data;

  // Normalise empty stop IDs to null
  const fromStopId = data.fromStopId || null;
  const toStopId = data.toStopId || null;

  // Validate stop ownership
  const stopError = await validateStopBelongsToTrip(tripId, [fromStopId, toStopId]);
  if (stopError) return stopError;

  // Determine sort order
  const maxTransport = await db.transport.findFirst({
    where: { tripId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxTransport?.sortOrder ?? -1) + 1;

  // Best-effort geocode for departure and arrival places
  let depLat: number | null = null;
  let depLng: number | null = null;
  if (data.depPlace) {
    const coords = await geocodePlace(data.depPlace);
    depLat = coords?.lat ?? null;
    depLng = coords?.lng ?? null;
  }

  let arrLat: number | null = null;
  let arrLng: number | null = null;
  if (data.arrPlace) {
    const coords = await geocodePlace(data.arrPlace);
    arrLat = coords?.lat ?? null;
    arrLng = coords?.lng ?? null;
  }

  const created = await db.transport.create({
    data: {
      tripId,
      mode: data.mode,
      fromStopId,
      toStopId,
      depPlace: data.depPlace ?? null,
      depAt: data.depAt ?? null,
      arrPlace: data.arrPlace ?? null,
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

  await recordActivity({ tripId, verb: "CREATED", entityType: "TRANSPORT", entityId: created.id, entityLabel: entityLabel("TRANSPORT", created as unknown as Record<string, unknown>) });
  revalidatePath(`/trips/${tripId}`);
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
    return validationErrors(parsed.error);
  }

  const data = parsed.data;

  const fromStopId = data.fromStopId || null;
  const toStopId = data.toStopId || null;

  const stopError = await validateStopBelongsToTrip(transport.tripId, [
    fromStopId,
    toStopId,
  ]);
  if (stopError) return stopError;

  const before = await db.transport.findUnique({ where: { id: transportId } });

  // Best-effort geocode for departure and arrival places
  let depLat: number | null = null;
  let depLng: number | null = null;
  if (data.depPlace) {
    const coords = await geocodePlace(data.depPlace);
    depLat = coords?.lat ?? null;
    depLng = coords?.lng ?? null;
  }

  let arrLat: number | null = null;
  let arrLng: number | null = null;
  if (data.arrPlace) {
    const coords = await geocodePlace(data.arrPlace);
    arrLat = coords?.lat ?? null;
    arrLng = coords?.lng ?? null;
  }

  const updated = await db.transport.update({
    where: { id: transportId },
    data: {
      mode: data.mode,
      fromStopId,
      toStopId,
      depPlace: data.depPlace ?? null,
      depAt: data.depAt ?? null,
      arrPlace: data.arrPlace ?? null,
      arrAt: data.arrAt ?? null,
      reference: data.reference ?? null,
      notes: data.notes ?? null,
      depLat,
      depLng,
      arrLat,
      arrLng,
    },
  });

  await recordActivity({
    tripId: transport.tripId,
    verb: "UPDATED",
    entityType: "TRANSPORT",
    entityId: transportId,
    entityLabel: entityLabel("TRANSPORT", updated as unknown as Record<string, unknown>),
    changes: describeChanges("TRANSPORT", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });
  revalidatePath(`/trips/${transport.tripId}`);
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
  await recordActivity({ tripId: transport.tripId, verb: "DELETED", entityType: "TRANSPORT", entityId: transportId, entityLabel: entityLabel("TRANSPORT", (doomed ?? {}) as unknown as Record<string, unknown>) });

  revalidatePath(`/trips/${transport.tripId}`);
  return { success: true };
}
