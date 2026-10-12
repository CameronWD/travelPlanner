import { cache } from "react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN } from "@/lib/plan-scope";
import { readTripShell } from "@/lib/trip-shell-reads";
import { tripTodayISO } from "@/lib/trip-today";
import { addDays } from "@/lib/dates";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";

const MONEY_DUE_WINDOW_DAYS = 14;

/**
 * The sidebar's Money count (spec §B2): real-plan Costs not yet Paid whose Due
 * date is overdue or within 14 days of the Trip's own today. Due dates are
 * "YYYY-MM-DD" strings, so `lte` compares them in date order.
 *
 * Surprise (ADR 0051): a Cost hidden from this viewer is not theirs to
 * chase, so `v.where.cost` keeps it out of the count — the budget's totals
 * still carry it (lib/budget.ts), only this nudge is filtered.
 */
export const loadMoneyDueCount = cache(async (tripId: string): Promise<number> => {
  const { user } = await requireTripAccess(tripId);
  const trip = await readTripShell(tripId);
  if (!trip) return 0;
  const v = await loadSurpriseVisibility(tripId, user.id);
  const horizon = addDays(tripTodayISO(trip.stops), MONEY_DUE_WINDOW_DAYS);
  return db.cost.count({
    where: { tripId, ...REAL_PLAN, paidAt: null, dueDate: { not: null, lte: horizon }, ...v.where.cost },
  });
});
