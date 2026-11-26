/**
 * Pure day-map model builder.
 *
 * Produces everything the UI needs for a single day's map view:
 * - `points`       – all located entities for the day
 * - `routePoints`  – ordered route: the Accommodation woken in → items (for polyline drawing)
 * - `perItemPrev`  – predecessor located point for each located item (for hop distances)
 *
 * No React, no Prisma, no network — fully unit-testable.
 */

import { googleDirectionsUrl, appleDirectionsUrl, directionsFromHereUrl } from "@/lib/map/maps";
import type { LocalMode } from "@/lib/travel-times/hops";
import { dayStartHop, type StartAccommodationRow } from "@/lib/travel-times/day-start";
import {
  byHopOrder,
  itemRouteKey,
  hopStopsById,
  hopInputs,
  forcedModeFor,
  planHops,
  resolveHop,
  toHopItem,
  toPlanTransport,
  type HopItemRow,
  type HopModeChoice,
  type HopStopRow,
  type HopTransportRow,
  type ResolvedHop,
  type TravelLookup,
} from "@/lib/travel-times/hops";

type DayMapPointKind = "item" | "accommodation" | "transport-dep" | "transport-arr";

export interface DayMapPoint {
  kind: DayMapPointKind;
  id: string;
  lat: number;
  lng: number;
  label: string;
  order?: number;
  address?: string | null;
  placeId?: string | null;
  category?: string;
  end?: { lat: number; lng: number } | null;
  routePolyline?: string | null;
}

// ---------------------------------------------------------------------------
// Input interfaces
// ---------------------------------------------------------------------------

export interface DayMapItemInput {
  id: string;
  title: string;
  lat?: number | null;
  lng?: number | null;
  startTime?: string | null;
  sortOrder: number;
  address?: string | null;
  placeId?: string | null;
  category?: string;
  endLat?: number | null;
  endLng?: number | null;
}

export interface DayMapAccommodationInput {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  placeId?: string | null;
}

export interface DayMapTransportInput {
  id: string;
  depPlace?: string | null;
  arrPlace?: string | null;
  depLat?: number | null;
  depLng?: number | null;
  depPlaceId?: string | null;
  arrLat?: number | null;
  arrLng?: number | null;
  arrPlaceId?: string | null;
}

// ---------------------------------------------------------------------------
// Output interface
// ---------------------------------------------------------------------------

export interface DayMapHop {
  fromId: string;
  toId: string;
  polyline: string | null;
  estimated: boolean;
  minutes: number | null;
  mode: "walk" | "drive" | "transit" | null;
}

export interface DayMapModel {
  points: DayMapPoint[];
  hops?: DayMapHop[];
  routePoints: DayMapPoint[];
  perItemPrev: Record<string, DayMapPoint | undefined>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A coordinate pair is "located" when both values are finite numbers. */
function isLocated(lat: number | null | undefined, lng: number | null | undefined): lat is number {
  return lat != null && lng != null && isFinite(lat) && isFinite(lng as number);
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildDayMapModel(input: {
  date: string;
  items: DayMapItemInput[];
  accommodation?: DayMapAccommodationInput | null;
  start?: DayMapAccommodationInput | null;
  transports: DayMapTransportInput[];
}): DayMapModel {
  const { items, accommodation, start, transports } = input;

  // ------------------------------------------------------------------
  // 1. Located items — sorted by (startTime ?? "99:99") then sortOrder
  // ------------------------------------------------------------------
  const locatedItems = items
    .filter((item) => isLocated(item.lat, item.lng))
    .sort((a, b) => {
      const ta = a.startTime ?? "99:99";
      const tb = b.startTime ?? "99:99";
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });

  const itemPoints: DayMapPoint[] = locatedItems.map((item, idx) => ({
    kind: "item",
    id: item.id,
    lat: item.lat as number,
    lng: item.lng as number,
    label: item.title,
    order: idx + 1,
    address: item.address,
    placeId: item.placeId,
    category: item.category,
    end: itemRouteKey({ lat: item.lat, lng: item.lng, endLat: item.endLat, endLng: item.endLng }) ? { lat: item.endLat as number, lng: item.endLng as number } : null,
  }));

  // ------------------------------------------------------------------
  // 2. Accommodation points: tonight's, and the one woken in (optional)
  // ------------------------------------------------------------------
  const accommodationPoint = accommodationPointOf(accommodation);
  const startPoint = start && start.id === accommodationPoint?.id ? accommodationPoint : accommodationPointOf(start);

  // ------------------------------------------------------------------
  // 3. Transport dep/arr points
  // ------------------------------------------------------------------
  const transportPoints: DayMapPoint[] = [];
  for (const transport of transports) {
    if (isLocated(transport.depLat, transport.depLng)) {
      transportPoints.push({
        kind: "transport-dep",
        id: transport.id,
        lat: transport.depLat as number,
        lng: transport.depLng as number,
        label: transport.depPlace ?? "Departure",
        placeId: transport.depPlaceId,
      });
    }
    if (isLocated(transport.arrLat, transport.arrLng)) {
      transportPoints.push({
        kind: "transport-arr",
        id: transport.id,
        lat: transport.arrLat as number,
        lng: transport.arrLng as number,
        label: transport.arrPlace ?? "Arrival",
        placeId: transport.arrPlaceId,
      });
    }
  }

  // ------------------------------------------------------------------
  // 4. Assemble `points`: items first, then accommodation, then transport
  // ------------------------------------------------------------------
  const points: DayMapPoint[] = [
    ...itemPoints,
    ...(startPoint && startPoint !== accommodationPoint ? [startPoint] : []),
    ...(accommodationPoint ? [accommodationPoint] : []),
    ...transportPoints,
  ];

  // ------------------------------------------------------------------
  // 5. `routePoints` = [start (if located), ...orderedItems]
  // ------------------------------------------------------------------
  const routePoints: DayMapPoint[] = [
    ...(startPoint ? [startPoint] : []),
    ...itemPoints,
  ];

  // ------------------------------------------------------------------
  // 6. `perItemPrev` — predecessor for each located item
  // ------------------------------------------------------------------
  const perItemPrev: Record<string, DayMapPoint | undefined> = {};
  for (let i = 0; i < itemPoints.length; i++) {
    const point = itemPoints[i];
    if (i === 0) {
      perItemPrev[point.id] = startPoint;
    } else {
      perItemPrev[point.id] = leavingPoint(itemPoints[i - 1]);
    }
  }

  return { points, routePoints, perItemPrev };
}

function accommodationPointOf(a: DayMapAccommodationInput | null | undefined): DayMapPoint | undefined {
  if (!a || !isLocated(a.lat, a.lng)) return undefined;
  return { kind: "accommodation", id: a.id, lat: a.lat as number, lng: a.lng as number, label: a.name, address: a.address, placeId: a.placeId };
}

// The next thing is reached from where the previous one finishes, not where it starts.
function leavingPoint(p: DayMapPoint): DayMapPoint {
  return p.end ? { ...p, lat: p.end.lat, lng: p.end.lng, address: null, placeId: null } : p;
}

type DayHopInput = {
  dayItems: HopItemRow[];
  stops: HopStopRow[];
  transports: (HopTransportRow & { id: string })[];
  lookup: TravelLookup;
  estimateOpts: { windingFactor: number; avgSpeedKph: number };
  hopModes?: ReadonlyMap<string, HopModeChoice>;
  accommodations?: StartAccommodationRow[];
  date?: string;
};

/** Each consecutive located pair on the Day map, with its resolved travel when the pair is a planned hop. One source for the map and the Claude connection. */
function resolvedDayHops(
  model: DayMapModel,
  input: DayHopInput,
): { fromId: string; toId: string; resolved: ResolvedHop | null; forced: HopModeChoice | undefined }[] {
  const items = input.dayItems.map(toHopItem).sort(byHopOrder);
  const byId = new Map(items.map((i) => [i.id, i]));
  const stopsById = hopStopsById(input.stops);
  const planTransports = input.transports.map(toPlanTransport);
  const planned = new Set(planHops(items, planTransports).map((h) => `${h.from.id}|${h.to.id}`));
  const order = model.routePoints.filter((p) => p.kind === "item");
  const out: { fromId: string; toId: string; resolved: ResolvedHop | null; forced: HopModeChoice | undefined }[] = [];
  for (let i = 1; i < order.length; i++) {
    const [a, b] = [order[i - 1].id, order[i].id];
    const from = byId.get(a);
    const to = byId.get(b);
    const inputs = from && to && planned.has(`${a}|${b}`) ? hopInputs({ from, to }, { stopsById, planTransports }) : null;
    const forced = from && to ? forcedModeFor(input.hopModes, { from, to }) : undefined;
    const resolved = inputs ? resolveHop(inputs.from, inputs.to, inputs.localMode, inputs.departure, input.lookup, input.estimateOpts, forced) : null;
    out.push({ fromId: a, toId: b, resolved, forced });
  }
  return out;
}

/** Every pair `planHops` makes for the day (both orderings), so each Hop mode being honoured has a row wherever hops are listed. */
export function resolvedPlanHops(
  input: DayHopInput,
): { fromId: string; toId: string; resolved: ResolvedHop; forced: HopModeChoice | undefined }[] {
  const items = input.dayItems.map(toHopItem).sort(byHopOrder);
  const stopsById = hopStopsById(input.stops);
  const planTransports = input.transports.map(toPlanTransport);
  return planHops(items, planTransports).flatMap((pair) => {
    const inputs = hopInputs(pair, { stopsById, planTransports });
    if (!inputs) return [];
    const forced = forcedModeFor(input.hopModes, pair);
    const resolved = resolveHop(inputs.from, inputs.to, inputs.localMode, inputs.departure, input.lookup, input.estimateOpts, forced);
    return [{ fromId: pair.from.id, toId: pair.to.id, resolved, forced }];
  });
}

export function resolvedStartHop(
  input: DayHopInput,
): { fromId: string; toId: string; resolved: ResolvedHop; localMode: LocalMode } | null {
  if (!input.accommodations || !input.date) return null;
  const start = dayStartHop({
    date: input.date,
    items: input.dayItems.map(toHopItem).sort(byHopOrder),
    accommodations: input.accommodations,
    stopsById: hopStopsById(input.stops),
    planTransports: input.transports.map(toPlanTransport),
  });
  if (!start) return null;
  const resolved = resolveHop(start.from, start.to, start.localMode, start.departure, input.lookup, input.estimateOpts);
  return { fromId: start.accommodationId, toId: start.toItemId, resolved, localMode: start.localMode };
}

function toDayMapHop(fromId: string, toId: string, resolved: ResolvedHop | null): DayMapHop {
  const polyline = resolved && !resolved.estimated && resolved.polyline ? resolved.polyline : null;
  return { fromId, toId, polyline, estimated: polyline === null, minutes: resolved ? Math.round(resolved.minutes) : null, mode: resolved?.mode ?? null };
}

export function dayMapHops(model: DayMapModel, input: DayHopInput): DayMapHop[] {
  const start = resolvedStartHop(input);
  return [
    ...(start ? [toDayMapHop(start.fromId, start.toId, start.resolved)] : []),
    ...resolvedDayHops(model, input).map(({ fromId, toId, resolved }) => toDayMapHop(fromId, toId, resolved)),
  ];
}

function withItemRoutes(points: DayMapPoint[], lookup: TravelLookup): DayMapPoint[] {
  return points.map((p) => {
    if (p.kind !== "item" || !p.end) return p;
    const row = lookup.get(itemRouteKey({ lat: p.lat, lng: p.lng, endLat: p.end.lat, endLng: p.end.lng }) ?? "");
    return { ...p, routePolyline: row?.status === "OK" && row.polyline ? row.polyline : null };
  });
}

export function withDayMapHops(
  dayMap: DayMapModel,
  rows: {
    items: HopItemRow[];
    stops: HopStopRow[];
    transports: (HopTransportRow & { id: string })[];
    accommodations: StartAccommodationRow[];
    trip: { drivingWindingFactor: number; drivingAvgSpeedKph: number };
  },
  date: string,
  lookup: TravelLookup,
  hopModes?: ReadonlyMap<string, HopModeChoice>,
): DayMapModel {
  return {
    ...dayMap,
    points: withItemRoutes(dayMap.points, lookup),
    hops: dayMapHops(dayMap, {
      dayItems: rows.items.filter((it) => it.date === date),
      stops: rows.stops,
      transports: rows.transports,
      lookup,
      estimateOpts: { windingFactor: rows.trip.drivingWindingFactor, avgSpeedKph: rows.trip.drivingAvgSpeedKph },
      hopModes,
      accommodations: rows.accommodations,
      date,
    }),
  };
}

// ---------------------------------------------------------------------------
// Per-item directions helper
// ---------------------------------------------------------------------------

/** Directions links to one Item from the previous located point (Timeline renders them). */
export interface ItemDirections {
  google: string | null;
  apple: string | null;
}

/** Per-item directions URLs from the previous located point to each located item. */
export function buildItemDirections(
  model: DayMapModel,
  opts?: { fromHere: boolean; mode: LocalMode | null },
): Record<string, ItemDirections> {
  const out: Record<string, ItemDirections> = {};
  for (const p of model.points) {
    if (p.kind !== "item") continue;
    if (opts?.fromHere) {
      out[p.id] = directionsFromHereUrl({ lat: p.lat, lng: p.lng }, opts.mode);
      continue;
    }
    const prev = model.perItemPrev[p.id];
    if (!prev) continue;
    out[p.id] = { google: googleDirectionsUrl([prev, p]), apple: appleDirectionsUrl([prev, p]) };
  }
  return out;
}
