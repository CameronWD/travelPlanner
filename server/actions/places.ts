"use server";

import { requireUser } from "@/lib/guards";
import { searchPlacesWithStatus, type PlaceSearchOutcome } from "@/lib/geocode";

/**
 * Place search for a page with no Trip or Globe yet (New trip). Server-side so
 * Nominatim sees our User-Agent; session-gated like every action.
 */
export async function findPlaces(query: string): Promise<PlaceSearchOutcome> {
  await requireUser();
  if (typeof query !== "string") return { status: "ok", candidates: [] };
  return searchPlacesWithStatus(query.slice(0, 200), 5);
}
