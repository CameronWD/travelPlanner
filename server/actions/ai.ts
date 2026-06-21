"use server";

import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import {
  suggestActivities,
  draftPackingList,
  parseBookingConfirmation,
  type AiResult,
  type SuggestActivitiesOutput,
  type DraftPackingListOutput,
  type ParseBookingOutput,
} from "@/lib/ai";

// ---------------------------------------------------------------------------
// aiSuggestActivities
// ---------------------------------------------------------------------------

/**
 * Suggest activities for a stop in a trip.
 *
 * - Access-checked via requireTripAccess.
 * - Verifies the stop belongs to the trip.
 * - Passes existing item titles for that stop to avoid duplicates.
 * - Returns a DRAFT — does not persist anything.
 */
export async function aiSuggestActivities(
  tripId: string,
  stopId: string,
): Promise<AiResult<SuggestActivitiesOutput>> {
  await requireTripAccess(tripId);

  // Load the stop and verify it belongs to this trip
  const stop = await db.stop.findUnique({
    where: { id: stopId },
    select: { id: true, name: true, country: true, tripId: true },
  });

  if (!stop || stop.tripId !== tripId) {
    return {
      ok: false,
      reason: "error",
      message: "Stop not found in this trip",
    };
  }

  // Load existing item titles for this stop so AI can avoid duplicates
  const existingItems = await db.item.findMany({
    where: { tripId, stopId },
    select: { title: true },
  });
  const existingTitles = existingItems.map((i) => i.title);

  return suggestActivities({
    stopName: stop.name,
    country: stop.country ?? undefined,
    existingTitles,
  });
}

// ---------------------------------------------------------------------------
// aiDraftPackingList
// ---------------------------------------------------------------------------

/**
 * Draft a packing list for a trip.
 *
 * - Access-checked via requireTripAccess.
 * - Returns a DRAFT — does not persist anything.
 */
export async function aiDraftPackingList(
  tripId: string,
): Promise<AiResult<DraftPackingListOutput>> {
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      name: true,
      startDate: true,
      endDate: true,
      stops: {
        orderBy: { sortOrder: "asc" },
        select: { name: true, country: true },
      },
    },
  });

  if (!trip) {
    return { ok: false, reason: "error", message: "Trip not found" };
  }

  return draftPackingList({
    tripName: trip.name,
    stops: trip.stops.map((s) => ({
      name: s.name,
      country: s.country ?? undefined,
    })),
    startDate: trip.startDate,
    endDate: trip.endDate,
  });
}

// ---------------------------------------------------------------------------
// aiParseBooking
// ---------------------------------------------------------------------------

/**
 * Parse a pasted booking confirmation text.
 *
 * - Access-checked via requireTripAccess.
 * - Returns a DRAFT — does not persist anything.
 */
export async function aiParseBooking(
  tripId: string,
  text: string,
): Promise<AiResult<ParseBookingOutput>> {
  await requireTripAccess(tripId);
  return parseBookingConfirmation({ text });
}
