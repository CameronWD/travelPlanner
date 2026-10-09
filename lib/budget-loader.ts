/**
 * `get_budget`'s loader (spec 2026-10-09, Task 10) and the Budget page's own
 * `buildBudget` input assembly, shared so the two never drift apart — same
 * pattern as `lib/next-steps-loader.ts` / `lib/desktop-home-loader.ts`.
 *
 * Self-contained: does its own Prisma queries (duplicating a subset of the
 * Budget page's, app/(app)/trips/[tripId]/budget/page.tsx), so a caller that
 * hasn't already fetched a trip's costs/stops/etc for some other reason (the
 * Claude connection's `get_budget` tool) can get a budget roll-up from just a
 * `tripId`.
 *
 * Real plan only unless a caller passes `forkId`: only the Budget page does,
 * to honour its own `?plan=` scoping (lib/plan-scope.ts) — the MCP tool never
 * passes one (constraints.md: no MCP tool accepts or passes a `forkId`).
 *
 * A date-less trip has no day window; buildBudget's grand total counts every
 * cost regardless of the window (lib/budget.ts), so `today` stands in for
 * both ends — same fallback as `loadHomePlanningData` (lib/desktop-home-loader.ts).
 */
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { planScope, type PlanId } from "@/lib/plan-scope";
import { todayISO } from "@/lib/dates";
import {
  buildBudget,
  type BudgetResult,
  type BudgetCost,
  type BudgetStopWithDates,
  type BudgetItem,
  type BudgetAccommodation,
  type BudgetTransport,
} from "@/lib/budget";

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

/**
 * Load a Trip's budget roll-up (lib/budget.ts's `buildBudget`), real plan
 * only unless `forkId` is given. Only the Budget page passes a `forkId`, to
 * honour its own `?plan=`; every other caller — `get_budget` included —
 * leaves it at the real plan.
 */
export async function loadBudget(tripId: string, forkId?: PlanId): Promise<BudgetResult> {
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { homeCurrency: true, startDate: true, endDate: true, chaptersEnabled: true },
  });

  const [allCosts, stops, items, accommodations, transports, chapters] = await Promise.all([
    db.cost.findMany({
      where: { tripId, ...planScope(forkId) },
      orderBy: { createdAt: "asc" },
      select: COST_SELECT,
    }),
    db.stop.findMany({
      // Rough (date-less) stops carry no costs onto the dated budget.
      where: { tripId, ...planScope(forkId), arriveDate: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true },
    }),
    db.item.findMany({
      where: { tripId, ...planScope(forkId) },
      select: { id: true, stopId: true, category: true, date: true },
    }),
    db.accommodation.findMany({
      where: { tripId, ...planScope(forkId) },
      select: { id: true, stopId: true, checkIn: true, checkOut: true },
    }),
    db.transport.findMany({
      where: { tripId, ...planScope(forkId) },
      select: { id: true, fromStopId: true, toStopId: true, depAt: true },
    }),
    // Rough (date-less) chapters have no dated window — buildBudget would
    // emit a blank $0 row for each, so exclude them (matches the Budget page).
    trip?.chaptersEnabled
      ? db.chapter.findMany({
          where: { tripId, ...planScope(forkId), startDate: { not: null } },
          orderBy: { startDate: "asc" },
          select: { id: true, name: true, colour: true, startDate: true, endDate: true },
        })
      : Promise.resolve([]),
  ]);

  const budgetCosts: BudgetCost[] = allCosts.map((c) => ({
    id: c.id,
    costMinor: c.costMinor,
    paidMinor: c.paidMinor,
    paidAt: c.paidAt,
    currency: c.currency,
    rateToHome: c.rateToHome,
    ownerType: c.ownerType as BudgetCost["ownerType"],
    ownerId: c.ownerId,
    label: c.label,
    category: c.category,
    settlement: c.settlement,
  }));

  // Non-null at runtime: the query filters rough (date-less) stops out.
  const budgetStops: BudgetStopWithDates[] = stops.map((s) => ({
    id: s.id,
    name: s.name,
    timezone: s.timezone,
    arriveDate: s.arriveDate!,
    departDate: s.departDate!,
    sortOrder: s.sortOrder,
  }));

  const budgetItems: BudgetItem[] = items.map((i) => ({
    id: i.id,
    stopId: i.stopId,
    category: i.category,
    date: i.date,
  }));

  const budgetAccommodations: BudgetAccommodation[] = accommodations.map((a) => ({
    id: a.id,
    stopId: a.stopId,
    checkIn: a.checkIn,
    checkOut: a.checkOut,
  }));

  const budgetTransports: BudgetTransport[] = transports.map((t) => ({
    id: t.id,
    fromStopId: t.fromStopId,
    toStopId: t.toStopId,
    depAt: t.depAt,
  }));

  // A date-less trip has no day window; today stands in for both ends.
  const today = todayISO();
  const tripStart = trip?.startDate ?? today;
  const tripEnd = trip?.endDate ?? tripStart;

  return buildBudget({
    homeCurrency: trip?.homeCurrency ?? "AUD",
    costs: budgetCosts,
    stops: budgetStops,
    items: budgetItems,
    accommodations: budgetAccommodations,
    transports: budgetTransports,
    tripStart,
    tripEnd,
    chapters: trip?.chaptersEnabled ? chapters : [],
  });
}
