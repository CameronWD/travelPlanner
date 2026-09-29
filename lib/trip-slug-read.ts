import { cache } from "react";
import { db } from "@/lib/db";

/**
 * The Trip's current slug for building links on the server (ADR 0064), or its
 * id when it has none yet. Memoised per request (React cache), like
 * requireTripAccess — a page and its layout share one lookup on a cold load.
 */
export const tripSlugFor = cache(async (tripId: string): Promise<string> => {
  const row = await db.trip.findUnique({ where: { id: tripId }, select: { slug: true } });
  return row?.slug ?? tripId;
});
