/**
 * Pure budget roll-up logic for Trip Planner.
 *
 * PURE — no Prisma, no React, no network calls. Fully unit-testable.
 *
 * Accepts plain typed inputs (mirroring Prisma shapes but framework-free)
 * and returns a rich budget summary ready for the budget page.
 */

import { convertMinor } from "@/lib/money";
import { categoryLabel } from "@/lib/categories";
import { addDays, nightsBetween } from "@/lib/dates";
import { enumerateTripDays } from "@/lib/itinerary";
import { instantToZonedDateISO } from "@/lib/tz";

// ---------------------------------------------------------------------------
// Input shapes (minimal — mirror Prisma but no Prisma import)
// ---------------------------------------------------------------------------

export interface BudgetCost {
  id: string;
  estimatedMinor: number;
  actualMinor: number | null;
  currency: string;
  /** Snapshot rate: 1 unit of cost.currency = rateToHome units of homeCurrency. */
  rateToHome: number | null;
  ownerType: "TRANSPORT" | "ACCOMMODATION" | "ITEM" | "OTHER";
  ownerId: string | null;
  /** For OTHER costs — human label. */
  label: string | null;
  /** For OTHER costs — optional category label (free-text). */
  category: string | null;
}

export interface BudgetStop {
  id: string;
  name: string;
  /** IANA timezone identifier (e.g. "Australia/Sydney"). */
  timezone?: string | null;
}

export interface BudgetItem {
  id: string;
  stopId: string | null;
  /** Category value from CATEGORIES (e.g. "SIGHTSEEING"). */
  category: string;
  /** Scheduled date YYYY-MM-DD or null/undefined if unscheduled. */
  date: string | null | undefined;
}

export interface BudgetAccommodation {
  id: string;
  stopId: string;
  checkIn: string;  // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
}

export interface BudgetTransport {
  id: string;
  fromStopId: string | null;
  toStopId: string | null;
  /** Departure instant — Date or ISO string. */
  depAt: Date | string | null;
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface BudgetTotals {
  estimatedMinor: number;
  actualMinor: number;
}

export interface BudgetByCategory {
  category: string;
  estimatedMinor: number;
  actualMinor: number;
}

export interface BudgetByStop {
  stopId: string | null;
  stopName: string;
  estimatedMinor: number;
  actualMinor: number;
}

export interface BudgetByDay {
  dateISO: string;
  estimatedMinor: number;
  actualMinor: number;
}

export interface BudgetResult {
  homeCurrency: string;
  /** Grand total in home minor units (missing-rate costs excluded). */
  grandTotal: BudgetTotals;
  /** Per-category breakdown, sorted descending by estimated. */
  byCategory: BudgetByCategory[];
  /** Per-stop breakdown; null stopId = "Trip-wide / Other". */
  byStop: BudgetByStop[];
  /**
   * Per-day breakdown — one entry per trip day including days with 0/0.
   * This lets the UI render a full strip without gaps.
   * Accommodation costs are spread across the nights between checkIn and checkOut.
   * OTHER costs and undated items are NOT placed on a day.
   */
  byDay: BudgetByDay[];
  /** Distinct currencies with no rate (excluded from all totals). */
  missingRates: string[];
  hasMissingRates: boolean;
}

// ---------------------------------------------------------------------------
// Helper: convertCostToHome
// ---------------------------------------------------------------------------

/**
 * Convert a single cost's estimated + actual amounts to home currency minor units.
 *
 * - Same currency as home → use amounts as-is (rate 1, no conversion).
 * - Foreign currency with a rate → convertMinor.
 * - Foreign currency with null rate → returns null (rate missing).
 */
export function convertCostToHome(
  cost: BudgetCost,
  homeCurrency: string,
): { estimatedHome: number | null; actualHome: number | null } {
  const from = cost.currency.toUpperCase();
  const home = homeCurrency.toUpperCase();

  if (from === home) {
    return {
      estimatedHome: cost.estimatedMinor,
      actualHome: cost.actualMinor ?? 0,
    };
  }

  if (typeof cost.rateToHome !== "number") {
    return { estimatedHome: null, actualHome: null };
  }

  const rate = cost.rateToHome;
  return {
    estimatedHome: convertMinor(cost.estimatedMinor, from, home, rate),
    actualHome:
      cost.actualMinor !== null && cost.actualMinor !== undefined
        ? convertMinor(cost.actualMinor, from, home, rate)
        : 0,
  };
}

// ---------------------------------------------------------------------------
// Helper: effectiveCategory
// ---------------------------------------------------------------------------

/**
 * Determine the display category string for a cost.
 *
 * - TRANSPORT → "Transport"
 * - ACCOMMODATION → "Accommodation"
 * - ITEM → category label from the item (via lookup), fallback "Activity"
 * - OTHER → cost.category (free-text label) or "Other"
 */
export function effectiveCategory(
  cost: BudgetCost,
  itemCategoryById: Record<string, string>,
): string {
  switch (cost.ownerType) {
    case "TRANSPORT":
      return "Transport";
    case "ACCOMMODATION":
      return "Accommodation";
    case "ITEM": {
      const itemCategory = cost.ownerId ? itemCategoryById[cost.ownerId] : undefined;
      if (itemCategory) {
        try {
          // categoryLabel expects a typed Category value — catch any unknown value
          return categoryLabel(itemCategory as Parameters<typeof categoryLabel>[0]);
        } catch {
          return "Activity";
        }
      }
      return "Activity";
    }
    case "OTHER":
      return cost.category ?? "Other";
    default:
      return "Other";
  }
}

// ---------------------------------------------------------------------------
// Helper: stopIdForCost
// ---------------------------------------------------------------------------

interface StopIdLookups {
  accommodationById: Record<string, BudgetAccommodation>;
  itemById: Record<string, BudgetItem>;
  transportById: Record<string, BudgetTransport>;
}

/**
 * Determine which stop a cost "belongs" to for the byStop breakdown.
 *
 * - ACCOMMODATION → accommodation's stopId
 * - ITEM → item's stopId (may be null if not attached to a stop)
 * - TRANSPORT → fromStopId, fallback toStopId
 * - OTHER → null (trip-wide)
 */
export function stopIdForCost(
  cost: BudgetCost,
  lookups: StopIdLookups,
): string | null {
  switch (cost.ownerType) {
    case "ACCOMMODATION": {
      if (!cost.ownerId) return null;
      const acc = lookups.accommodationById[cost.ownerId];
      return acc?.stopId ?? null;
    }
    case "ITEM": {
      if (!cost.ownerId) return null;
      const item = lookups.itemById[cost.ownerId];
      return item?.stopId ?? null;
    }
    case "TRANSPORT": {
      if (!cost.ownerId) return null;
      const transport = lookups.transportById[cost.ownerId];
      if (!transport) return null;
      return transport.fromStopId ?? transport.toStopId ?? null;
    }
    case "OTHER":
      return null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Main: buildBudget
// ---------------------------------------------------------------------------

export interface BuildBudgetInput {
  homeCurrency: string;
  costs: BudgetCost[];
  stops: BudgetStop[];
  items: BudgetItem[];
  accommodations: BudgetAccommodation[];
  transports: BudgetTransport[];
  tripStart: string; // YYYY-MM-DD
  tripEnd: string;   // YYYY-MM-DD
}

/**
 * Build a full budget roll-up from raw trip data.
 *
 * All arithmetic is in integer minor units in the home currency.
 * Costs with missing FX rates are excluded from totals but reported in missingRates.
 *
 * byDay includes every trip day with zeros so the UI can render a complete strip.
 */
export function buildBudget({
  homeCurrency,
  costs,
  stops,
  items,
  accommodations,
  transports,
  tripStart,
  tripEnd,
}: BuildBudgetInput): BudgetResult {
  // Build lookup maps for O(1) access
  const stopById: Record<string, BudgetStop> = {};
  for (const s of stops) stopById[s.id] = s;

  const itemById: Record<string, BudgetItem> = {};
  for (const i of items) itemById[i.id] = i;

  const accommodationById: Record<string, BudgetAccommodation> = {};
  for (const a of accommodations) accommodationById[a.id] = a;

  const transportById: Record<string, BudgetTransport> = {};
  for (const t of transports) transportById[t.id] = t;

  const itemCategoryById: Record<string, string> = {};
  for (const i of items) itemCategoryById[i.id] = i.category;

  const lookups: StopIdLookups = { accommodationById, itemById, transportById };

  // Enumerate all trip days
  const tripDays = enumerateTripDays(tripStart, tripEnd);

  // Initialize per-day accumulators
  const dayEstimated: Record<string, number> = {};
  const dayActual: Record<string, number> = {};
  for (const day of tripDays) {
    dayEstimated[day] = 0;
    dayActual[day] = 0;
  }

  // Category accumulators
  const categoryEstimated: Record<string, number> = {};
  const categoryActual: Record<string, number> = {};

  // Stop accumulators (null key = trip-wide)
  const stopEstimated: Record<string, number> = {};
  const stopActual: Record<string, number> = {};

  // Grand totals
  let grandEstimated = 0;
  let grandActual = 0;

  // Missing rates (currencies with no rate → excluded from totals)
  const missingRateSet = new Set<string>();

  // ---------------------------------------------------------------------------
  // Process each cost
  // ---------------------------------------------------------------------------
  for (const cost of costs) {
    const { estimatedHome, actualHome } = convertCostToHome(cost, homeCurrency);

    // If home values are null (missing rate) → exclude from all totals
    if (estimatedHome === null) {
      missingRateSet.add(cost.currency.toUpperCase());
      continue;
    }

    const actualVal = actualHome ?? 0;

    // Grand total
    grandEstimated += estimatedHome;
    grandActual += actualVal;

    // Category breakdown
    const cat = effectiveCategory(cost, itemCategoryById);
    categoryEstimated[cat] = (categoryEstimated[cat] ?? 0) + estimatedHome;
    categoryActual[cat] = (categoryActual[cat] ?? 0) + actualVal;

    // Stop breakdown
    const sid = stopIdForCost(cost, lookups);
    const stopKey = sid ?? "___TRIPWIDE___";
    stopEstimated[stopKey] = (stopEstimated[stopKey] ?? 0) + estimatedHome;
    stopActual[stopKey] = (stopActual[stopKey] ?? 0) + actualVal;

    // Day breakdown
    placeCostOnDays(cost, estimatedHome, actualVal, {
      itemById,
      accommodationById,
      transportById,
      stopById,
      tripDays,
      dayEstimated,
      dayActual,
    });
  }

  // ---------------------------------------------------------------------------
  // Assemble byCategory (sorted desc by estimated)
  // ---------------------------------------------------------------------------
  const byCategory: BudgetByCategory[] = Object.entries(categoryEstimated)
    .map(([category, estimatedMinor]) => ({
      category,
      estimatedMinor,
      actualMinor: categoryActual[category] ?? 0,
    }))
    .sort((a, b) => b.estimatedMinor - a.estimatedMinor);

  // ---------------------------------------------------------------------------
  // Assemble byStop (null stopId = "Trip-wide / Other")
  // ---------------------------------------------------------------------------
  const byStop: BudgetByStop[] = [];

  // Add named stops first (in their original order)
  for (const stop of stops) {
    const est = stopEstimated[stop.id];
    if (est !== undefined) {
      byStop.push({
        stopId: stop.id,
        stopName: stop.name,
        estimatedMinor: est,
        actualMinor: stopActual[stop.id] ?? 0,
      });
    }
  }

  // Trip-wide costs (OTHER costs + items/transports without a stop)
  const tripwideEst = stopEstimated["___TRIPWIDE___"];
  if (tripwideEst !== undefined) {
    byStop.push({
      stopId: null,
      stopName: "Trip-wide / Other",
      estimatedMinor: tripwideEst,
      actualMinor: stopActual["___TRIPWIDE___"] ?? 0,
    });
  }

  // ---------------------------------------------------------------------------
  // Assemble byDay
  // ---------------------------------------------------------------------------
  const byDay: BudgetByDay[] = tripDays.map((dateISO) => ({
    dateISO,
    estimatedMinor: dayEstimated[dateISO] ?? 0,
    actualMinor: dayActual[dateISO] ?? 0,
  }));

  return {
    homeCurrency,
    grandTotal: {
      estimatedMinor: grandEstimated,
      actualMinor: grandActual,
    },
    byCategory,
    byStop,
    byDay,
    missingRates: Array.from(missingRateSet).sort(),
    hasMissingRates: missingRateSet.size > 0,
  };
}

// ---------------------------------------------------------------------------
// Internal: place a cost onto per-day accumulators
// ---------------------------------------------------------------------------

interface PlaceCostContext {
  itemById: Record<string, BudgetItem>;
  accommodationById: Record<string, BudgetAccommodation>;
  transportById: Record<string, BudgetTransport>;
  stopById: Record<string, BudgetStop>;
  tripDays: string[];
  dayEstimated: Record<string, number>;
  dayActual: Record<string, number>;
}

function placeCostOnDays(
  cost: BudgetCost,
  estimatedHome: number,
  actualHome: number,
  ctx: PlaceCostContext,
): void {
  const { itemById, accommodationById, transportById, stopById, tripDays, dayEstimated, dayActual } = ctx;
  const tripStart = tripDays[0];
  const tripEnd = tripDays[tripDays.length - 1];

  switch (cost.ownerType) {
    case "ITEM": {
      if (!cost.ownerId) return;
      const item = itemById[cost.ownerId];
      if (!item?.date) return; // undated item → not placed on a day

      const dateISO = item.date;
      if (dateISO >= tripStart && dateISO <= tripEnd) {
        dayEstimated[dateISO] = (dayEstimated[dateISO] ?? 0) + estimatedHome;
        dayActual[dateISO] = (dayActual[dateISO] ?? 0) + actualHome;
      }
      break;
    }

    case "TRANSPORT": {
      if (!cost.ownerId) return;
      const transport = transportById[cost.ownerId];
      if (!transport?.depAt) return; // no departure time → skip

      const tz = getTransportTimezone(transport.fromStopId, stopById);
      const dateISO = instantToZonedDateISO(
        transport.depAt instanceof Date ? transport.depAt : new Date(transport.depAt),
        tz,
      );

      if (dateISO >= tripStart && dateISO <= tripEnd) {
        dayEstimated[dateISO] = (dayEstimated[dateISO] ?? 0) + estimatedHome;
        dayActual[dateISO] = (dayActual[dateISO] ?? 0) + actualHome;
      }
      break;
    }

    case "ACCOMMODATION": {
      if (!cost.ownerId) return;
      const acc = accommodationById[cost.ownerId];
      if (!acc) return;

      // Spread across nights between checkIn and checkOut
      spreadAcrossNights(acc.checkIn, acc.checkOut, estimatedHome, actualHome, {
        tripStart,
        tripEnd,
        dayEstimated,
        dayActual,
      });
      break;
    }

    case "OTHER":
      // Other costs → not placed on any day
      break;
  }
}

/**
 * Look up the timezone for a stop by its id.
 * Returns 'UTC' if not found or no timezone set.
 */
function getTransportTimezone(
  fromStopId: string | null | undefined,
  stopById: Record<string, BudgetStop>,
): string {
  if (!fromStopId) return "UTC";
  const stop = stopById[fromStopId];
  return stop?.timezone ?? "UTC";
}

interface SpreadContext {
  tripStart: string;
  tripEnd: string;
  dayEstimated: Record<string, number>;
  dayActual: Record<string, number>;
}

/**
 * Spread an accommodation cost evenly across the nights between checkIn and
 * checkOut, constrained to [tripStart, tripEnd].
 *
 * Distributes the remainder to the first nights so parts sum exactly to total.
 */
function spreadAcrossNights(
  checkIn: string,
  checkOut: string,
  estimatedHome: number,
  actualHome: number,
  ctx: SpreadContext,
): void {
  const { tripStart, tripEnd, dayEstimated, dayActual } = ctx;

  const totalNights = nightsBetween(checkIn, checkOut);
  if (totalNights <= 0) return;

  // Effective date range: clamp to trip
  const effectiveStart = checkIn >= tripStart ? checkIn : tripStart;
  const effectiveEnd = checkOut <= tripEnd ? checkOut : tripEnd;

  if (effectiveStart >= effectiveEnd) return;

  // Collect which nights (day = the night of that day) fall in range
  const nights: string[] = [];
  let current = effectiveStart;
  while (current < effectiveEnd) {
    nights.push(current);
    current = addDays(current, 1);
  }

  const numNights = nights.length;
  if (numNights === 0) return;

  // Distribute evenly with remainder on first nights
  const baseEst = Math.floor(estimatedHome / totalNights);
  const remainderEst = estimatedHome - baseEst * totalNights;

  const baseAct = Math.floor(actualHome / totalNights);
  const remainderAct = actualHome - baseAct * totalNights;

  for (let i = 0; i < numNights; i++) {
    const day = nights[i];
    // Use night index relative to full checkIn for remainder distribution
    // (first nights within effective range get the remainder)
    const nightIndex = i; // remainder goes to first nights in the clamped range
    const estForNight = baseEst + (nightIndex < remainderEst ? 1 : 0);
    const actForNight = baseAct + (nightIndex < remainderAct ? 1 : 0);

    dayEstimated[day] = (dayEstimated[day] ?? 0) + estForNight;
    dayActual[day] = (dayActual[day] ?? 0) + actForNight;
  }
}
