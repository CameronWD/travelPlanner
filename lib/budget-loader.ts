/**
 * `get_budget`'s loader (spec 2026-10-09, Task 10), split in two so a caller
 * that already has its own rows never pays for a second set of queries:
 *
 * - `buildBudgetFromRows` — PURE. The Budget page's own `buildBudget` input
 *   assembly (app/(app)/trips/[tripId]/budget/page.tsx), extracted verbatim
 *   so the page and `get_budget` can never drift apart. Takes rows the
 *   caller already fetched; does no I/O of its own.
 * - `loadBudget` — does its own Prisma queries (real plan only unless a
 *   `forkId` is given — only the Budget page passes one, to honour its own
 *   `?plan=`; the MCP tool never does, constraints.md), then calls
 *   `buildBudgetFromRows`. For a caller with no existing read to reuse (the
 *   Claude connection's `get_budget` tool).
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
import type { ChapterLike } from "@/lib/chapters";

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

// ---------------------------------------------------------------------------
// Pure assembler
// ---------------------------------------------------------------------------

interface RawCostRow {
  id: string;
  costMinor: number;
  paidMinor: number | null;
  paidAt: Date | string | null;
  currency: string;
  rateToHome: number | null;
  ownerType: string;
  ownerId: string | null;
  label: string | null;
  category: string | null;
  settlement?: string;
}

/** A dated Stop row (arriveDate/departDate non-null at runtime — callers filter rough stops out first). */
interface RawDatedStopRow {
  id: string;
  name: string;
  timezone?: string | null;
  arriveDate: string | null;
  departDate: string | null;
  sortOrder: number;
}

interface RawItemRow {
  id: string;
  stopId: string | null;
  category: string;
  date: string | null | undefined;
}

interface RawAccommodationRow {
  id: string;
  stopId: string;
  checkIn: string;
  checkOut: string;
}

interface RawTransportRow {
  id: string;
  fromStopId: string | null;
  toStopId: string | null;
  depAt: Date | string | null;
}

export interface BudgetAssemblyInput {
  homeCurrency: string;
  costs: RawCostRow[];
  /** Dated stops only — a caller that fetches rough stops too must filter them out first. */
  stops: RawDatedStopRow[];
  items: RawItemRow[];
  accommodations: RawAccommodationRow[];
  transports: RawTransportRow[];
  tripStart: string; // YYYY-MM-DD
  tripEnd: string; // YYYY-MM-DD
  /** [] for a disabled/no-chapters trip — the caller gates this, not the assembler. */
  chapters: ChapterLike[];
}

/**
 * Assemble `buildBudget`'s input from raw (Prisma-shaped) rows and run it.
 * No I/O — callers that already hold these rows (the Budget page) call this
 * directly; `loadBudget` below is for a caller that doesn't.
 */
export function buildBudgetFromRows({
  homeCurrency,
  costs,
  stops,
  items,
  accommodations,
  transports,
  tripStart,
  tripEnd,
  chapters,
}: BudgetAssemblyInput): BudgetResult {
  const budgetCosts: BudgetCost[] = costs.map((c) => ({
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

  // Non-null at runtime: callers filter rough (date-less) stops out before
  // passing them here.
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

  return buildBudget({
    homeCurrency,
    costs: budgetCosts,
    stops: budgetStops,
    items: budgetItems,
    accommodations: budgetAccommodations,
    transports: budgetTransports,
    tripStart,
    tripEnd,
    chapters,
  });
}

// ---------------------------------------------------------------------------
// Thin, self-contained loader (get_budget)
// ---------------------------------------------------------------------------

/**
 * Load a Trip's budget roll-up from just a `tripId`: its own queries, real
 * plan only unless `forkId` is given. Only the Budget page passes a
 * `forkId`, to honour its own `?plan=`; every other caller — `get_budget`
 * included — leaves it at the real plan. The Budget page itself does NOT
 * call this — it already holds these rows for other reasons (owner labels,
 * the Rates strip) and calls `buildBudgetFromRows` directly instead, so
 * rendering the page never runs these queries twice.
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

  // A date-less trip has no day window; today stands in for both ends.
  const today = todayISO();
  const tripStart = trip?.startDate ?? today;
  const tripEnd = trip?.endDate ?? tripStart;

  return buildBudgetFromRows({
    homeCurrency: trip?.homeCurrency ?? "AUD",
    costs: allCosts,
    stops,
    items,
    accommodations,
    transports,
    tripStart,
    tripEnd,
    chapters: trip?.chaptersEnabled ? chapters : [],
  });
}
