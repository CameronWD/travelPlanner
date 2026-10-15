import { cache } from "react";
import { readTripShell } from "@/lib/trip-shell-reads";

/**
 * The Trip's current slug for building links on the server (ADR 0064), or its
 * id when it has none yet. A projection of the cached `readTripShell` (spec
 * 2026-10-14 card A), so a page, its layout and every other shell reader share
 * one Trip query per request instead of each paying its own.
 */
export const tripSlugFor = cache(async (tripId: string): Promise<string> => {
  const row = await readTripShell(tripId);
  return row?.slug ?? tripId;
});
