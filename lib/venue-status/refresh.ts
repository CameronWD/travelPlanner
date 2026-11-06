import "server-only";
import { db } from "@/lib/db";
import { dailyCap } from "@/lib/google-budget";
import { lookUpBusinessStatus } from "@/lib/geocode";
import { takeGoogleQuota } from "@/lib/google-usage";
import { orderPlanStops } from "@/lib/plan-order";
import { currentTripTimezone, instantToZonedDateISO } from "@/lib/tz";

const MAX_LOOKUPS_PER_RUN = 20;
// The GetPlace console quota is shared with user picks, and Google's day resets on Pacific time, not UTC.
export const VENUE_STATUS_DAILY_CAP = 80;
const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export async function refreshVenueStatuses(tripId: string, now = new Date()): Promise<{ checked: number; skippedQuota: boolean }> {
  const trip = await db.trip.findUnique({
    where: { id: tripId, deletedAt: null },
    select: { startDate: true, endDate: true, stops: { where: { forkId: null }, orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true, arriveDate: true, departDate: true, timezone: true } } },
  });
  if (!trip) return { checked: 0, skippedQuota: false };
  const end = trip.endDate ?? trip.startDate;
  if (end && instantToZonedDateISO(now, currentTripTimezone(orderPlanStops(trip.stops))) > end) return { checked: 0, skippedQuota: false };

  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
  const places = await db.item.findMany({
    where: { tripId, placeId: { not: null }, OR: [{ statusCheckedAt: null }, { statusCheckedAt: { lt: cutoff } }] },
    orderBy: { statusCheckedAt: { sort: "asc", nulls: "first" } },
    distinct: ["placeId"],
    take: MAX_LOOKUPS_PER_RUN,
    select: { placeId: true },
  });

  const cap = Math.min(dailyCap("venue-status"), VENUE_STATUS_DAILY_CAP);
  let checked = 0;
  for (const { placeId } of places) {
    if (!(await takeGoogleQuota("venue-status", cap))) return { checked, skippedQuota: true };
    const found = await lookUpBusinessStatus(placeId!);
    if (!found) continue;
    const data = "notFound" in found ? { statusCheckedAt: now } : { businessStatus: found.businessStatus, statusCheckedAt: now };
    await db.item.updateMany({ where: { tripId, placeId }, data });
    if (!("notFound" in found)) checked++;
  }
  return { checked, skippedQuota: false };
}
