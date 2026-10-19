import "server-only";
import { cache } from "react";
import type { Flag } from "@/lib/flags";
import { flagsForRows, loadFlagRows } from "@/lib/flags-loader";
import { getTripProjection } from "@/lib/trip-projection-reads";

/**
 * The Flags firing now, as a Review sees them (lib/review/input.ts): read as a
 * Share link's null viewer, every Surprise masked. Null for a Trip without
 * dates, which has no Flags at all: unknown, so nothing reads Fixed in the plan.
 * Called from lib/review-reads.ts after its own requireTripAccess, so the
 * guarded getTripProjection's check is the cached second call, not a new one.
 *
 * Wrapped in React's `cache()`, like lib/guards.ts: memoised per request,
 * keyed on `tripId`, so the Reviews page (listReviews, latestReview,
 * getReview) and Home work the Flags out once, not once per read.
 */
export const loadLiveFlags = cache(async (tripId: string): Promise<ReadonlyMap<string, Flag> | null> => {
  const [rows, projection] = await Promise.all([loadFlagRows(tripId, null), getTripProjection(tripId)]);
  if (!rows) return null;
  return new Map(flagsForRows(rows, projection).map((f) => [f.id, f]));
});
