/**
 * The Past Home's ONE query path (spec D, Task 17): the phone Phase
 * (components/trip/home/phase-past.tsx, layout "phone") and the desktop (lg+)
 * tile grid (same component, layout "desktop") both render the wrap-up from
 * this model on the same request. Wrapped in React's `cache()` and keyed on
 * primitives, so the second call is free.
 *
 * Deliberately NO auth import: the only caller is the trip Home page, which
 * has already run `requireTripAccess`. Policy (not a BND-2 spelling
 * exemption): a dated view — always the real plan, ignoring `?plan=`.
 */
import { cache } from "react";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { nightsBetween } from "@/lib/dates";
import {
  buildBudget,
  applyFxRatesToCosts,
  type BudgetStopWithDates,
  type BudgetItem,
  type BudgetAccommodation,
  type BudgetTransport,
} from "@/lib/budget";
import { buildSpendSoFar, type SpendCost } from "@/lib/spend-so-far";
import { chapterForStop } from "@/lib/chapters";
import type { RouteMapStop } from "@/components/trip/route-map";
import { orderPlanStops } from "@/lib/plan-order";

const COST_SELECT = {
  id: true,
  costMinor: true,
  paidMinor: true,
  currency: true,
  rateToHome: true,
  paidAt: true,
  ownerType: true,
  ownerId: true,
  label: true,
  category: true,
  settlement: true,
} as const;

async function loadPastHomeUncached(
  tripId: string,
  tripStart: string,
  tripEnd: string | null,
  homeCurrency: string,
  chaptersEnabled: boolean,
) {
  const startDate = tripStart;
  const endDate = tripEnd ?? startDate;

  const [
    datedStopsRaw,
    transports,
    accommodations,
    items,
    costs,
    exchangeRates,
    datedChaptersRaw,
    journalCount,
  ] = await Promise.all([
    db.stop.findMany({
      // Dated views follow the real plan — CONTEXT.md; consistent with
      // calendar/day/print/summary. Policy (not a BND-2 spelling exemption):
      // deliberately ignores `?plan=` — never wire in a variable plan here.
      where: { tripId, ...REAL_PLAN, arriveDate: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        timezone: true,
        arriveDate: true,
        departDate: true,
        sortOrder: true,
      },
    }),
    db.transport.findMany({
      where: { tripId, ...REAL_PLAN },
      select: {
        id: true,
        mode: true,
        fromStopId: true,
        toStopId: true,
        depAt: true,
        arrAt: true,
      },
    }),
    db.accommodation.findMany({
      where: { tripId, ...REAL_PLAN },
      select: {
        id: true,
        stopId: true,
        name: true,
        checkIn: true,
        checkOut: true,
      },
    }),
    db.item.findMany({
      where: { tripId, ...REAL_PLAN },
      select: {
        id: true,
        stopId: true,
        category: true,
        date: true,
        startTime: true,
        endTime: true,
      },
    }),
    db.cost.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { createdAt: "asc" },
      select: COST_SELECT,
    }),
    db.exchangeRate.findMany({
      where: { tripId },
      select: { base: true, quote: true, rate: true },
    }),
    // A disabled trip renders as if it had no chapters (Task 13) — skip the
    // query entirely rather than fetch-then-discard.
    chaptersEnabled
      ? db.chapter.findMany({
          where: { tripId, ...REAL_PLAN, startDate: { not: null } },
          orderBy: { startDate: "asc" },
          select: {
            id: true,
            name: true,
            colour: true,
            startDate: true,
            endDate: true,
          },
        })
      : Promise.resolve([]),
    db.journalEntry.count({ where: { tripId } }),
  ]);

  // ---------------------------------------------------------------------------
  // Apply FX rates to costs
  // ---------------------------------------------------------------------------
  const costsWithRates = applyFxRatesToCosts({ costs, exchangeRates, homeCurrency });

  // ---------------------------------------------------------------------------
  // Narrow nullable date fields
  // ---------------------------------------------------------------------------
  // ADR 0038: a scheduled stop's position IS its dates — re-sort canonically
  // before rendering (the route map reads this array's order); the fetch's
  // orderBy stays sortOrder.
  const datedStops = orderPlanStops(
    datedStopsRaw.map((s) => ({
      ...s,
      arriveDate: s.arriveDate!,
      departDate: s.departDate!,
    })),
  );

  const datedChapters = datedChaptersRaw.map((c) => ({
    ...c,
    startDate: c.startDate!,
    endDate: c.endDate!,
  }));

  // ---------------------------------------------------------------------------
  // Build budget roll-up
  // ---------------------------------------------------------------------------
  const budgetStops: BudgetStopWithDates[] = datedStops.map((s) => ({
    id: s.id,
    name: s.name,
    timezone: s.timezone,
    arriveDate: s.arriveDate,
    departDate: s.departDate,
    sortOrder: s.sortOrder,
  }));

  const budget = buildBudget({
    homeCurrency,
    costs: costsWithRates,
    stops: budgetStops,
    items: items as BudgetItem[],
    accommodations: accommodations as BudgetAccommodation[],
    transports: transports as BudgetTransport[],
    tripStart: startDate,
    tripEnd: endDate,
    chapters: datedChapters,
  });

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const totalNights = nightsBetween(startDate, endDate);
  const { grandTotal } = budget;

  // Spend retro: use trip end as "today" so tripElapsedPct reads 100 %.
  // Fed the same FX-applied costs as the budget roll-up, so "Trip cost" and
  // "of X cost" can never disagree on a multi-currency trip.
  const spend = buildSpendSoFar({
    costs: costsWithRates as SpendCost[],
    homeCurrency,
    tripStart: startDate,
    tripEnd: endDate,
    today: endDate,
  });

  const mapStops: RouteMapStop[] = datedStops.map((s) => {
    const ch = chapterForStop(s, datedChapters);
    return {
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
      sortOrder: s.sortOrder,
      chapterName: ch?.name ?? null,
    };
  });

  // ---------------------------------------------------------------------------
  // Final spend derived values
  // ---------------------------------------------------------------------------
  const stopCount = datedStops.length;
  const paidSoFarMinor = spend.paidSoFarMinor;
  const costTotalMinor = spend.costTotalMinor;
  const varianceMinor = spend.varianceMinor;
  const underBudget = varianceMinor <= 0;
  const pct = costTotalMinor > 0 ? Math.min(100, Math.round((paidSoFarMinor / costTotalMinor) * 100)) : 0;

  return {
    totalNights,
    grandTotal,
    mapStops,
    stopCount,
    paidSoFarMinor,
    costTotalMinor,
    varianceMinor,
    underBudget,
    pct,
    journalCount,
  };
}

export const loadPastHome = cache(loadPastHomeUncached);

export type PastHome = Awaited<ReturnType<typeof loadPastHomeUncached>>;
