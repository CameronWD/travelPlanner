import "server-only";
import { db } from "@/lib/db";
import { dailyCap } from "@/lib/google-budget";
import { lookUpBusinessStatus } from "@/lib/geocode";
import { takeGoogleQuota } from "@/lib/google-usage";
import { orderPlanStops } from "@/lib/plan-order";
import { currentTripTimezone, instantToZonedDateISO } from "@/lib/tz";

const MAX_LOOKUPS_PER_RUN = 20;
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
  const items = await db.item.findMany({
    where: { tripId, placeId: { not: null }, OR: [{ statusCheckedAt: null }, { statusCheckedAt: { lt: cutoff } }] },
    orderBy: { statusCheckedAt: { sort: "asc", nulls: "first" } },
    take: MAX_LOOKUPS_PER_RUN,
    select: { id: true, placeId: true },
  });

  let checked = 0;
  for (const item of items) {
    if (!(await takeGoogleQuota("venue-status", dailyCap("venue-status")))) return { checked, skippedQuota: true };
    const found = await lookUpBusinessStatus(item.placeId!);
    if (!found) continue;
    await db.item.update({ where: { id: item.id }, data: { businessStatus: found.businessStatus, statusCheckedAt: now } });
    checked++;
  }
  return { checked, skippedQuota: false };
}
