"use server";

import { requireUser } from "@/lib/guards";
import { searchPlacesTypeahead, type PlaceSearchOutcome } from "@/lib/geocode";

/**
 * The place combobox's as-you-type search (components/ui/place-combobox.tsx),
 * for pages with no Trip or Globe yet (New trip) and the Stop forms. Goes to
 * Photon, not Nominatim — Nominatim forbids autocomplete (ADR 0069).
 * Server-side and session-gated like every action.
 */
export async function findPlaces(query: string): Promise<PlaceSearchOutcome> {
  await requireUser();
  if (typeof query !== "string") return { status: "ok", candidates: [] };
  return searchPlacesTypeahead(query.slice(0, 200), 5);
}
