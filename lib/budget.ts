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
import { addDays, daysBetween, nightsBetween } from "@/lib/dates";
import { enumerateTripDays } from "@/lib/itinerary";
import { instantToZonedDateISO } from "@/lib/tz";
import { chapterIdForTransport, chapterForStop, chapterForDate, type ChapterLike, type StopLike } from "@/lib/chapters";

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

/**
 * Extended stop shape that includes the date fields needed for chapter
 * membership lookups. Pass these as `stops` to get a by-chapter breakdown.
 * Fields mirror `StopLike` from lib/chapters.ts.
 */
export interface BudgetStopWithDates extends BudgetStop {
  arriveDate: string;  // YYYY-MM-DD
  departDate: string;  // YYYY-MM-DD
  sortOrder: number;
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

export interface BudgetByChapter {
  chapterId: string;
  chapterName: string;
  colour: string;
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
  /**
   * Per-chapter cost breakdown, sorted by chapter startDate ascending.
   * Empty when no chapters are provided.
   */
  byChapter: BudgetByChapter[];
  /**
   * Reconciliation buckets: costs not attributable to a specific chapter.
   * ungrouped + betweenLegs + otherCosts + ΣbyChapter === grandTotal.
   */
  chapterReconciliation: {
    /** Costs on stops (or items/dates) that fall outside all chapter date ranges. */
    ungrouped: BudgetTotals;
    /** Transport costs that cross chapter boundaries. */
    betweenLegs: BudgetTotals;
    /** ownerType === "OTHER" costs (always trip-wide). */
    otherCosts: BudgetTotals;
  };
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
// Helper: applyFxRatesToCosts
// ---------------------------------------------------------------------------

export interface ExchangeRateInput { base: string; quote: string; rate: number; }

/** Raw cost row as selected from the DB (COST_SELECT shape); ownerType is a free
 * string here and is narrowed to BudgetCost's union on the way out. */
export interface RawCostInput {
  id: string; estimatedMinor: number; actualMinor: number | null; currency: string;
  rateToHome: number | null; ownerType: string; ownerId: string | null;
  label: string | null; category: string | null;
}

/**
 * Resolve each cost's home-currency rate, producing BudgetCost[] ready for
 * buildBudget. A cost keeps its snapshot rateToHome when present; otherwise a
 * foreign-currency cost's rate is looked up from the trip's exchange-rate table
 * (built bidirectionally — a base:quote row also yields its quote:base inverse,
 * skipping zero rates to avoid division by zero). Home-currency costs and
 * unresolved foreign costs keep a null rate.
 *
 * PURE — no Prisma, no network. Single source of truth for the FX assembly that
 * previously lived (duplicated) in summary/print/phase-planning/phase-past.
 */
export function applyFxRatesToCosts({
  costs, exchangeRates, homeCurrency,
}: { costs: RawCostInput[]; exchangeRates: ExchangeRateInput[]; homeCurrency: string }): BudgetCost[] {
  const rateMap = new Map<string, number>();
  for (const r of exchangeRates) {
    rateMap.set(`${r.base}:${r.quote}`, r.rate);
    if (r.rate !== 0) rateMap.set(`${r.quote}:${r.base}`, 1 / r.rate);
  }
  const home = homeCurrency.toUpperCase();
  return costs.map((c) => {
    let rateToHome = c.rateToHome ?? null;
    if (rateToHome === null && c.currency.toUpperCase() !== home) {
      rateToHome = rateMap.get(`${c.currency.toUpperCase()}:${home}`) ?? null;
    }
    return { ...c, rateToHome } as BudgetCost;
  });
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
  /** Basic stop info for byStop breakdown; use BudgetStopWithDates to enable byChapter. */
  stops: BudgetStop[];
  items: BudgetItem[];
  accommodations: BudgetAccommodation[];
  transports: BudgetTransport[];
  tripStart: string; // YYYY-MM-DD
  tripEnd: string;   // YYYY-MM-DD
  /**
   * Optional chapter definitions. When provided, the result will include
   * `byChapter` and `chapterReconciliation`. Defaults to [] when omitted.
   */
  chapters?: ChapterLike[];
}

// ---------------------------------------------------------------------------
// Chapter sentinel keys (internal)
// ---------------------------------------------------------------------------

const SENTINEL_UNGROUPED    = "__UNGROUPED__";
const SENTINEL_BETWEEN_LEGS = "__BETWEEN_LEGS__";
const SENTINEL_OTHER        = "__OTHER__";

/**
 * Classify a cost into a chapter id or a sentinel bucket.
 *
 * - ownerType "OTHER"           → SENTINEL_OTHER
 * - ownerType "TRANSPORT"       → chapterIdForTransport result, else SENTINEL_BETWEEN_LEGS
 * - ownerType "ACCOMMODATION"   → chapter of the accommodation's stop, else SENTINEL_UNGROUPED
 * - ownerType "ITEM"            → chapter of the item's stop or item's date, else SENTINEL_UNGROUPED
 *
 * When no chapters are configured, non-OTHER costs always fall to SENTINEL_UNGROUPED
 * (because chapterForStop/chapterForDate return null when chapters is empty).
 */
function chapterKeyForCost(
  cost: BudgetCost,
  lookups: StopIdLookups,
  chapters: readonly ChapterLike[],
  stopsById: Record<string, StopLike>,
): string {
  if (cost.ownerType === "OTHER") return SENTINEL_OTHER;

  if (cost.ownerType === "TRANSPORT") {
    // With no chapters configured, all transport falls into ungrouped
    // (there are no legs to be "between").
    if (chapters.length === 0) return SENTINEL_UNGROUPED;
    if (!cost.ownerId) return SENTINEL_BETWEEN_LEGS;
    const transport = lookups.transportById[cost.ownerId];
    if (!transport) return SENTINEL_BETWEEN_LEGS;
    const chId = chapterIdForTransport(transport, chapters, stopsById);
    return chId ?? SENTINEL_BETWEEN_LEGS;
  }

  if (cost.ownerType === "ACCOMMODATION") {
    if (!cost.ownerId) return SENTINEL_UNGROUPED;
    const acc = lookups.accommodationById[cost.ownerId];
    if (!acc) return SENTINEL_UNGROUPED;
    const stop = stopsById[acc.stopId];
    if (!stop) return SENTINEL_UNGROUPED;
    return chapterForStop(stop, chapters)?.id ?? SENTINEL_UNGROUPED;
  }

  if (cost.ownerType === "ITEM") {
    if (!cost.ownerId) return SENTINEL_UNGROUPED;
    const item = lookups.itemById[cost.ownerId];
    if (!item) return SENTINEL_UNGROUPED;
    // Try via stop first
    if (item.stopId) {
      const stop = stopsById[item.stopId];
      if (stop) {
        return chapterForStop(stop, chapters)?.id ?? SENTINEL_UNGROUPED;
      }
    }
    // Fall back to item date
    if (item.date) {
      return chapterForDate(item.date, chapters)?.id ?? SENTINEL_UNGROUPED;
    }
    return SENTINEL_UNGROUPED;
  }

  return SENTINEL_UNGROUPED;
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
  chapters = [],
}: BuildBudgetInput): BudgetResult {
  // Build lookup maps for O(1) access
  const stopById: Record<string, BudgetStop> = {};
  for (const s of stops) stopById[s.id] = s;

  // Build a StopLike map for chapter membership lookups.
  // Only stops that carry arriveDate/departDate/sortOrder (BudgetStopWithDates)
  // are included; basic BudgetStop entries are silently omitted.
  const stopsLikeById: Record<string, StopLike> = {};
  for (const s of stops) {
    const ext = s as Partial<BudgetStopWithDates>;
    if (ext.arriveDate !== undefined && ext.departDate !== undefined && ext.sortOrder !== undefined) {
      stopsLikeById[s.id] = {
        id: s.id,
        arriveDate: ext.arriveDate,
        departDate: ext.departDate,
        sortOrder: ext.sortOrder,
      };
    }
  }

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

  // Chapter accumulators (keyed by chapter id or sentinel)
  const chapterAccEstimated: Record<string, number> = {};
  const chapterAccActual: Record<string, number> = {};

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

    // Chapter breakdown
    const chKey = chapterKeyForCost(cost, lookups, chapters, stopsLikeById);
    chapterAccEstimated[chKey] = (chapterAccEstimated[chKey] ?? 0) + estimatedHome;
    chapterAccActual[chKey] = (chapterAccActual[chKey] ?? 0) + actualVal;

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

  // ---------------------------------------------------------------------------
  // Assemble byChapter (sorted by startDate ascending)
  // ---------------------------------------------------------------------------
  const byChapter: BudgetByChapter[] = [...chapters]
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))
    .map((ch) => ({
      chapterId: ch.id,
      chapterName: ch.name,
      colour: ch.colour,
      estimatedMinor: chapterAccEstimated[ch.id] ?? 0,
      actualMinor: chapterAccActual[ch.id] ?? 0,
    }));

  // ---------------------------------------------------------------------------
  // Assemble chapterReconciliation (sentinel buckets)
  // ---------------------------------------------------------------------------
  const chapterReconciliation = {
    ungrouped: {
      estimatedMinor: chapterAccEstimated[SENTINEL_UNGROUPED] ?? 0,
      actualMinor: chapterAccActual[SENTINEL_UNGROUPED] ?? 0,
    },
    betweenLegs: {
      estimatedMinor: chapterAccEstimated[SENTINEL_BETWEEN_LEGS] ?? 0,
      actualMinor: chapterAccActual[SENTINEL_BETWEEN_LEGS] ?? 0,
    },
    otherCosts: {
      estimatedMinor: chapterAccEstimated[SENTINEL_OTHER] ?? 0,
      actualMinor: chapterAccActual[SENTINEL_OTHER] ?? 0,
    },
  };

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
    byChapter,
    chapterReconciliation,
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
 * Per-night amounts are computed over the FULL stay duration; only nights that
 * fall within [tripStart, tripEnd] are placed on byDay. For a stay fully inside
 * the trip the per-night parts sum exactly to the total; for a stay that
 * straddles a trip boundary, only the in-window nights' shares appear in byDay
 * (the full cost always appears in grandTotal regardless of clamping).
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

  // Effective date range: clamp to trip. A "night" is keyed by its check-in
  // date, so the nights of a [checkIn, checkOut) stay are [checkIn, checkOut).
  // When the guest stays through/past the trip's last day, the night of
  // `tripEnd` itself is in-window, so the exclusive end clamps to tripEnd + 1
  // (not tripEnd) — otherwise that final night is silently dropped.
  const effectiveStart = checkIn >= tripStart ? checkIn : tripStart;
  const effectiveEnd =
    checkOut <= tripEnd ? checkOut : addDays(tripEnd, 1);

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
    // Remainder cents are distributed to the first nights of the FULL stay
    // (offset from the real check-in), so a stay that straddles the trip start
    // doesn't misattribute an out-of-window night's remainder to an in-window
    // night.
    const nightIndex = daysBetween(checkIn, day);
    const estForNight = baseEst + (nightIndex < remainderEst ? 1 : 0);
    const actForNight = baseAct + (nightIndex < remainderAct ? 1 : 0);

    dayEstimated[day] = (dayEstimated[day] ?? 0) + estForNight;
    dayActual[day] = (dayActual[day] ?? 0) + actForNight;
  }
}
