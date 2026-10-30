"use server";

import { requireTripAccess } from "@/lib/guards";
import { takeGoogleQuota } from "@/lib/google-usage";
import { fetchVenueDetails, type VenueDetails } from "@/lib/geocode";

const VENUE_DETAILS_DAILY_CAP = 15;

export async function venueDetailsForPick(tripId: string, placeId: string): Promise<VenueDetails | null> {
  await requireTripAccess(tripId);
  if (!placeId) return null;
  if (!(await takeGoogleQuota("venue-details", VENUE_DETAILS_DAILY_CAP))) return null;
  return fetchVenueDetails(placeId);
}
