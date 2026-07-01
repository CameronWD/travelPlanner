/**
 * Pure compare-metrics engine for the Fork / What-If Plans feature.
 *
 * PURE — no Prisma, no React, no network calls. Fully unit-testable.
 *
 * Computes a summary of key metrics for one plan variant and diffs two
 * PlanMetrics objects to produce deltas for the Compare view.
 */

import { computeProjectedEnd, HARD_END_APPROACHING_NIGHTS, type ProjectionStop } from "@/lib/firm-up";
import {
  detectFlags,
  type FlagStop,
  type FlagTransport,
  type FlagAccommodation,
  type FlagItem,
} from "@/lib/flags";
import {
  applyFxRatesToCosts,
  buildBudget,
  type RawCostInput,
  type ExchangeRateInput,
  type BudgetStop,
  type BudgetItem,
  type BudgetAccommodation,
  type BudgetTransport,
} from "@/lib/budget";
import { haversineKm, estimateDriveMinutes, type LatLng } from "@/lib/geo";
import { daysBetween } from "@/lib/dates";

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

export interface CompareStop {
  id: string;
  name: string;
  country: string | null;
  nights: number | null;
  sortOrder: number;
  arriveDate: string | null;
  departDate: string | null;
  pinned: boolean;
  lat: number | null;
  lng: number | null;
  timezone: string;
}

export interface CompareTransport {
  id: string;
  mode: string;
  fromStopId: string | null;
  toStopId: string | null;
  depAt: string | null;
  arrAt: string | null;
}

export interface CompareAccommodation {
  id: string;
  stopId: string;
  name: string;
  checkIn: string;
  checkOut: string;
}

export interface CompareItem {
  id: string;
  stopId: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  lat: number | null;
  lng: number | null;
  category: string;
}

export interface CompareTrip {
  startDate: string | null;
  hardEndDate: string | null;
  homeCurrency: string;
  drivingWindingFactor: number;
  drivingAvgSpeedKph: number;
}

export interface PlanMetricsInput {
  stops: CompareStop[];
  transports: CompareTransport[];
  accommodations: CompareAccommodation[];
  items: CompareItem[];
  costs: RawCostInput[];
  trip: CompareTrip;
  exchangeRates: ExchangeRateInput[];
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface PlanMetrics {
  stopCount: number;
  nightTotal: number;
  countries: string[];
  projectedEnd: string | null;
  hardEndState: "ok" | "approaching" | "over" | "none";
  budgetHomeMinor: number | null;
  flagCounts: { warning: number; info: number };
  transitMinutes: number;
  drivingMinutes: number;
  flightCount: number;
  route: { name: string; country: string | null; nights: number | null }[];
  legs: { fromName: string; toName: string; mode: string }[];
}

export interface MetricDeltas {
  stopCount: number;
  nightTotal: number;
  budgetHomeMinor: number | null;
  flagWarnings: number;
  flagInfos: number;
  transitMinutes: number;
  drivingMinutes: number;
  flightCount: number;
  /** Day-delta of projectedEnd (variant minus base); null if either is null. */
  projectedEndDays: number | null;
}

// ---------------------------------------------------------------------------
// computePlanMetrics
// ---------------------------------------------------------------------------

/**
 * Compute key metrics for one plan variant. Delegates to the canonical pure
 * engines (computeProjectedEnd, detectFlags, buildBudget, haversineKm, etc.)
 * — no logic is duplicated here.
 */
export function computePlanMetrics(input: PlanMetricsInput): PlanMetrics {
  const { stops, transports, accommodations, items, costs, trip, exchangeRates } = input;

  // Sort stops by sortOrder for all ordered operations
  const sortedStops = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);

  // ---------------------------------------------------------------------------
  // stop/night totals and route
  // ---------------------------------------------------------------------------

  const stopCount = stops.length;
  let nightTotal = 0;
  for (const s of stops) {
    nightTotal += s.nights ?? 0;
  }

  // Route in sortOrder, distinct countries in first-appearance order
  const route = sortedStops.map((s) => ({
    name: s.name,
    country: s.country,
    nights: s.nights,
  }));

  const seenCountries = new Set<string>();
  const countries: string[] = [];
  for (const s of sortedStops) {
    if (s.country !== null && !seenCountries.has(s.country)) {
      seenCountries.add(s.country);
      countries.push(s.country);
    }
  }

  // ---------------------------------------------------------------------------
  // projectedEnd — delegate to computeProjectedEnd
  // ---------------------------------------------------------------------------

  const projectionStops: ProjectionStop[] = sortedStops.map((s) => ({
    id: s.id,
    arriveDate: s.arriveDate,
    departDate: s.departDate,
    nights: s.nights,
    pinned: s.pinned,
    sortOrder: s.sortOrder,
  }));

  const projectedEnd = computeProjectedEnd(projectionStops, trip.startDate);

  // ---------------------------------------------------------------------------
  // hardEndState
  // ---------------------------------------------------------------------------

  let hardEndState: PlanMetrics["hardEndState"] = "none";
  if (trip.hardEndDate && projectedEnd) {
    const slack = daysBetween(projectedEnd, trip.hardEndDate); // hardEnd - projectedEnd, positive = slack
    if (slack < 0) {
      hardEndState = "over";
    } else if (slack <= HARD_END_APPROACHING_NIGHTS) {
      hardEndState = "approaching";
    } else {
      hardEndState = "ok";
    }
  }

  // ---------------------------------------------------------------------------
  // budgetHomeMinor — via applyFxRatesToCosts + buildBudget
  // ---------------------------------------------------------------------------

  const budgetCosts = applyFxRatesToCosts({
    costs,
    exchangeRates,
    homeCurrency: trip.homeCurrency,
  });

  // Determine trip date range for buildBudget.
  // Use projectedEnd if available, else fall back to startDate (single-day trip).
  const tripStart = trip.startDate ?? "1970-01-01";
  const tripEnd = projectedEnd ?? tripStart;

  const budgetStops: BudgetStop[] = stops.map((s) => ({
    id: s.id,
    name: s.name,
    timezone: s.timezone,
  }));

  const budgetItems: BudgetItem[] = items.map((i) => ({
    id: i.id,
    stopId: i.stopId,
    category: i.category,
    date: i.date,
  }));

  const budgetAccoms: BudgetAccommodation[] = accommodations.map((a) => ({
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

  const budgetResult = buildBudget({
    homeCurrency: trip.homeCurrency,
    costs: budgetCosts,
    stops: budgetStops,
    items: budgetItems,
    accommodations: budgetAccoms,
    transports: budgetTransports,
    tripStart,
    tripEnd,
  });

  const budgetHomeMinor: number | null = budgetResult.grandTotal.estimatedMinor;

  // ---------------------------------------------------------------------------
  // flagCounts — delegate to detectFlags
  // ---------------------------------------------------------------------------

  // Only scheduled stops (with both dates) can be passed to detectFlags since
  // FlagStop requires arriveDate + departDate as strings.
  const scheduledStops: FlagStop[] = stops
    .filter((s): s is CompareStop & { arriveDate: string; departDate: string } =>
      s.arriveDate !== null && s.departDate !== null,
    )
    .map((s) => ({
      id: s.id,
      name: s.name,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
      timezone: s.timezone,
      lat: s.lat,
      lng: s.lng,
      sortOrder: s.sortOrder,
    }));

  const flagTransports: FlagTransport[] = transports.map((t) => ({
    id: t.id,
    mode: t.mode,
    fromStopId: t.fromStopId,
    toStopId: t.toStopId,
    depAt: t.depAt,
    arrAt: t.arrAt,
  }));

  const flagAccoms: FlagAccommodation[] = accommodations.map((a) => ({
    id: a.id,
    stopId: a.stopId,
    name: a.name,
    checkIn: a.checkIn,
    checkOut: a.checkOut,
  }));

  const flagItems: FlagItem[] = items.map((i) => ({
    id: i.id,
    stopId: i.stopId,
    date: i.date,
    startTime: i.startTime,
    endTime: i.endTime,
    lat: i.lat,
    lng: i.lng,
  }));

  // Determine tripStart and tripEnd for flag detection from scheduled stops.
  // Fall back to projectedEnd or startDate when no scheduled stops exist.
  let flagTripStart = trip.startDate ?? tripStart;
  let flagTripEnd = projectedEnd ?? tripStart;

  if (scheduledStops.length > 0) {
    const arriveDates = scheduledStops.map((s) => s.arriveDate);
    const departDates = scheduledStops.map((s) => s.departDate);
    const minArrive = arriveDates.reduce((a, b) => (a < b ? a : b));
    const maxDepart = departDates.reduce((a, b) => (a > b ? a : b));
    flagTripStart = trip.startDate ? (trip.startDate < minArrive ? trip.startDate : minArrive) : minArrive;
    flagTripEnd = maxDepart;
  }

  const roughStopCount = stops.filter((s) => s.arriveDate === null).length;

  // Only run flag detection when there is a meaningful trip window.
  // When there are no stops at all and projectedEnd is null, there is no
  // itinerary to check, so all flag counts are zero.
  let warningCount = 0;
  let infoCount = 0;

  if (stops.length > 0 || projectedEnd !== null) {
    const flags = detectFlags({
      stops: scheduledStops,
      transports: flagTransports,
      accommodations: flagAccoms,
      items: flagItems,
      tripStart: flagTripStart,
      tripEnd: flagTripEnd,
      roughStopCount,
      projectedEnd,
      hardEndDate: trip.hardEndDate,
      drivingWindingFactor: trip.drivingWindingFactor,
      drivingAvgSpeedKph: trip.drivingAvgSpeedKph,
    });

    for (const f of flags) {
      if (f.severity === "warning") warningCount++;
      else if (f.severity === "info") infoCount++;
    }
  }

  // ---------------------------------------------------------------------------
  // flightCount — mode === "FLIGHT" (from lib/enums.ts: TRANSPORT_MODES)
  // ---------------------------------------------------------------------------

  const flightCount = transports.filter((t) => t.mode === "FLIGHT").length;

  // ---------------------------------------------------------------------------
  // transitMinutes — sum (arrAt - depAt) in minutes where both set
  // ---------------------------------------------------------------------------

  let transitMinutes = 0;
  for (const t of transports) {
    if (!t.depAt || !t.arrAt) continue;
    const dep = new Date(t.depAt).getTime();
    const arr = new Date(t.arrAt).getTime();
    if (!isNaN(dep) && !isNaN(arr) && arr > dep) {
      transitMinutes += (arr - dep) / 60000;
    }
  }

  // ---------------------------------------------------------------------------
  // drivingMinutes — CAR legs with both endpoint coords via haversine + estimate
  // ---------------------------------------------------------------------------

  const stopById = new Map(stops.map((s) => [s.id, s]));

  const legs: PlanMetrics["legs"] = [];
  for (const t of transports) {
    if (!t.fromStopId || !t.toStopId) continue;
    const from = stopById.get(t.fromStopId);
    const to = stopById.get(t.toStopId);
    if (!from || !to) continue;
    legs.push({ fromName: from.name, toName: to.name, mode: t.mode });
  }

  let drivingMinutes = 0;

  for (const t of transports) {
    if (t.mode !== "CAR") continue;
    if (!t.fromStopId || !t.toStopId) continue;
    const from = stopById.get(t.fromStopId);
    const to = stopById.get(t.toStopId);
    if (!from || !to) continue;
    if (from.lat == null || from.lng == null || to.lat == null || to.lng == null) continue;
    if (!isFinite(from.lat) || !isFinite(from.lng) || !isFinite(to.lat) || !isFinite(to.lng)) continue;

    const fromLatLng: LatLng = { lat: from.lat, lng: from.lng };
    const toLatLng: LatLng = { lat: to.lat, lng: to.lng };
    const km = haversineKm(fromLatLng, toLatLng);
    drivingMinutes += estimateDriveMinutes(km, {
      windingFactor: trip.drivingWindingFactor,
      avgSpeedKph: trip.drivingAvgSpeedKph,
    });
  }

  return {
    stopCount,
    nightTotal,
    countries,
    projectedEnd,
    hardEndState,
    budgetHomeMinor,
    flagCounts: { warning: warningCount, info: infoCount },
    transitMinutes,
    drivingMinutes,
    flightCount,
    route,
    legs,
  };
}

// ---------------------------------------------------------------------------
// diffMetrics
// ---------------------------------------------------------------------------

/**
 * Compute numeric deltas of variant vs base.
 *
 * All deltas are variant minus base (positive = variant has more).
 */
export function diffMetrics(base: PlanMetrics, variant: PlanMetrics): MetricDeltas {
  // projectedEnd day delta — null if either is null
  let projectedEndDays: number | null = null;
  if (base.projectedEnd !== null && variant.projectedEnd !== null) {
    projectedEndDays = daysBetween(base.projectedEnd, variant.projectedEnd);
  }

  // budgetHomeMinor delta — null if either is null
  let budgetHomeMinorDelta: number | null = null;
  if (base.budgetHomeMinor !== null && variant.budgetHomeMinor !== null) {
    budgetHomeMinorDelta = variant.budgetHomeMinor - base.budgetHomeMinor;
  }

  return {
    stopCount: variant.stopCount - base.stopCount,
    nightTotal: variant.nightTotal - base.nightTotal,
    budgetHomeMinor: budgetHomeMinorDelta,
    flagWarnings: variant.flagCounts.warning - base.flagCounts.warning,
    flagInfos: variant.flagCounts.info - base.flagCounts.info,
    transitMinutes: variant.transitMinutes - base.transitMinutes,
    drivingMinutes: variant.drivingMinutes - base.drivingMinutes,
    flightCount: variant.flightCount - base.flightCount,
    projectedEndDays,
  };
}
