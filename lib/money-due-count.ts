import { cache } from "react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN } from "@/lib/plan-scope";
import { readTripShell } from "@/lib/trip-shell-reads";
import { tripTodayISO } from "@/lib/trip-today";
import { addDays } from "@/lib/dates";

export const MONEY_DUE_WINDOW_DAYS = 14;

/**
 * The sidebar's Money count (spec §B2): real-plan Costs not yet Paid whose Due
 * date is overdue or within 14 days of the Trip's own today. Due dates are
 * "YYYY-MM-DD" strings, so `lte` compares them in date order.
 */
export const loadMoneyDueCount = cache(async (tripId: string): Promise<number> => {
  await requireTripAccess(tripId);
  const trip = await readTripShell(tripId);
  if (!trip) return 0;
  const horizon = addDays(tripTodayISO(trip.stops), MONEY_DUE_WINDOW_DAYS);
  return db.cost.count({ where: { tripId, ...REAL_PLAN, paidAt: null, dueDate: { not: null, lte: horizon } } });
});
