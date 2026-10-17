import type { Prisma } from "@prisma/client";
import { REAL_PLAN, type PlanId } from "@/lib/plan-scope";
import { softEndDate, grownEndDate } from "@/lib/soft-end";
import type { TripScope } from "@/lib/revalidate";

/**
 * F4 (spec 2026-10-16; CONTEXT.md **Trip**): grow `Trip.endDate` — the soft
 * end — to cover the plan home: the later of the last scheduled Stop's
 * depart and the return leg's landing in the Home base's zone
 * (`lib/soft-end.ts`). Called inside (or straight after) every write that
 * dates or re-dates a Stop or a Home-bound leg, app and Claude alike.
 *
 * - Real plan only: a Fork's write leaves the Trip window alone (dated
 *   views read the real plan only — lib/day-reads.ts); `promoteFork` calls
 *   this once the Fork's rows are the real plan.
 * - A date-less Trip (no start) stays date-less.
 * - Never shrinks: the write is conditional on the stored end being earlier,
 *   so two racing grows can't pull it back. No Activity, no Flag; the Hard
 *   end date is never touched (ADR 0068).
 *
 * Plain module (not "use server"): it does no access check of its own —
 * every caller has already run its guard.
 *
 * @returns the new endDate when it grew, else null.
 */
export async function growTripEndTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  plan: PlanId,
): Promise<string | null> {
  if (plan) return null;
  const trip = await tx.trip.findUnique({
    where: { id: tripId },
    select: { startDate: true, endDate: true, homeTimezone: true },
  });
  if (!trip?.startDate) return null;
  const [stops, transports] = await Promise.all([
    tx.stop.findMany({
      where: { tripId, ...REAL_PLAN },
      select: { id: true, sortOrder: true, arriveDate: true, departDate: true, timezone: true },
    }),
    tx.transport.findMany({
      where: { tripId, ...REAL_PLAN, arrAt: { not: null } },
      select: { fromStopId: true, toStopId: true, depIsHome: true, arrIsHome: true, arrAt: true },
    }),
  ]);
  const next = grownEndDate(trip.endDate, softEndDate({ stops, transports, homeTimezone: trip.homeTimezone }));
  if (!next) return null;
  const { count } = await tx.trip.updateMany({
    where: { id: tripId, OR: [{ endDate: null }, { endDate: { lt: next } }] },
    data: { endDate: next },
  });
  return count > 0 ? next : null;
}

/**
 * The extra revalidation scope a grown window needs: the trip layout shows
 * the date range (and "trip" also covers /trips). Spread after the action's
 * own scopes: `revalidateTrip(tripId, "plan", ...tripWindowScopes(grownTo))`.
 */
export function tripWindowScopes(grownTo: string | null): TripScope[] {
  return grownTo ? ["trip"] : [];
}
