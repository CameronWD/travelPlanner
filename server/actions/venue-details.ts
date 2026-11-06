"use server";

import { requireTripAccess } from "@/lib/guards";
import { dailyCap } from "@/lib/google-budget";
import { takeGoogleQuota } from "@/lib/google-usage";
import { fetchVenueDetails, hasServerKey, type VenueDetails } from "@/lib/geocode";

export async function venueDetailsForPick(tripId: string, placeId: string): Promise<VenueDetails | null> {
  await requireTripAccess(tripId);
  if (!placeId || !hasServerKey()) return null;
  if (!(await takeGoogleQuota("venue-details", dailyCap("venue-details")))) return null;
  return fetchVenueDetails(placeId);
}
