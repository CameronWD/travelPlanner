/**
 * Pure day-map model builder.
 *
 * Produces everything the UI needs for a single day's map view:
 * - `points`       – all located entities for the day
 * - `routePoints`  – ordered route: accommodation → items (for polyline drawing)
 * - `perItemPrev`  – predecessor located point for each located item (for hop distances)
 *
 * No React, no Prisma, no network — fully unit-testable.
 */

import { googleDirectionsUrl, appleDirectionsUrl } from "@/lib/map/maps";
import {
  byHopOrder,
  hopStopsById,
  hopInputs,
  planHops,
  resolveHop,
  toHopItem,
  toPlanTransport,
  type HopItemRow,
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
  transports: DayMapTransportInput[];
}): DayMapModel {
  const { items, accommodation, transports } = input;

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
  }));

  // ------------------------------------------------------------------
  // 2. Accommodation point (optional)
  // ------------------------------------------------------------------
  let accommodationPoint: DayMapPoint | undefined;
  if (accommodation && isLocated(accommodation.lat, accommodation.lng)) {
    accommodationPoint = {
      kind: "accommodation",
      id: accommodation.id,
      lat: accommodation.lat as number,
      lng: accommodation.lng as number,
      label: accommodation.name,
      address: accommodation.address,
      placeId: accommodation.placeId,
    };
  }

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
    ...(accommodationPoint ? [accommodationPoint] : []),
    ...transportPoints,
  ];

  // ------------------------------------------------------------------
  // 5. `routePoints` = [accommodation (if located), ...orderedItems]
  // ------------------------------------------------------------------
  const routePoints: DayMapPoint[] = [
    ...(accommodationPoint ? [accommodationPoint] : []),
    ...itemPoints,
  ];

  // ------------------------------------------------------------------
  // 6. `perItemPrev` — predecessor for each located item
  // ------------------------------------------------------------------
  const perItemPrev: Record<string, DayMapPoint | undefined> = {};
  for (let i = 0; i < itemPoints.length; i++) {
    const point = itemPoints[i];
    if (i === 0) {
      // First located item: predecessor is accommodation (if located), else undefined
      perItemPrev[point.id] = accommodationPoint;
    } else {
      perItemPrev[point.id] = itemPoints[i - 1];
    }
  }

  return { points, routePoints, perItemPrev };
}

type DayHopInput = {
  dayItems: HopItemRow[];
  stops: HopStopRow[];
  transports: (HopTransportRow & { id: string })[];
  lookup: TravelLookup;
  estimateOpts: { windingFactor: number; avgSpeedKph: number };
};

/** Each consecutive located pair on the Day map, with its resolved travel when the pair is a planned hop. One source for the map and the Claude connection. */
export function resolvedDayHops(
  model: DayMapModel,
  input: DayHopInput,
): { fromId: string; toId: string; resolved: ResolvedHop | null }[] {
  const items = input.dayItems.map(toHopItem).sort(byHopOrder);
  const byId = new Map(items.map((i) => [i.id, i]));
  const stopsById = hopStopsById(input.stops);
  const planTransports = input.transports.map(toPlanTransport);
  const planned = new Set(planHops(items, planTransports).map((h) => `${h.from.id}|${h.to.id}`));
  const order = model.routePoints.filter((p) => p.kind === "item");
  const out: { fromId: string; toId: string; resolved: ResolvedHop | null }[] = [];
  for (let i = 1; i < order.length; i++) {
    const [a, b] = [order[i - 1].id, order[i].id];
    const from = byId.get(a);
    const to = byId.get(b);
    const inputs = from && to && planned.has(`${a}|${b}`) ? hopInputs({ from, to }, { stopsById, planTransports }) : null;
    const resolved = inputs ? resolveHop(inputs.from, inputs.to, inputs.localMode, inputs.departure, input.lookup, input.estimateOpts) : null;
    out.push({ fromId: a, toId: b, resolved });
  }
  return out;
}

export function dayMapHops(model: DayMapModel, input: DayHopInput): DayMapHop[] {
  return resolvedDayHops(model, input).map(({ fromId, toId, resolved }) => {
    const polyline = resolved && !resolved.estimated && resolved.polyline ? resolved.polyline : null;
    return { fromId, toId, polyline, estimated: polyline === null };
  });
}

export function withDayMapHops(
  dayMap: DayMapModel,
  rows: {
    items: HopItemRow[];
    stops: HopStopRow[];
    transports: (HopTransportRow & { id: string })[];
    trip: { drivingWindingFactor: number; drivingAvgSpeedKph: number };
  },
  date: string,
  lookup: TravelLookup,
): DayMapModel {
  return {
    ...dayMap,
    hops: dayMapHops(dayMap, {
      dayItems: rows.items.filter((it) => it.date === date),
      stops: rows.stops,
      transports: rows.transports,
      lookup,
      estimateOpts: { windingFactor: rows.trip.drivingWindingFactor, avgSpeedKph: rows.trip.drivingAvgSpeedKph },
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
): Record<string, ItemDirections> {
  const out: Record<string, ItemDirections> = {};
  for (const p of model.points) {
    if (p.kind !== "item") continue;
    const prev = model.perItemPrev[p.id];
    if (!prev) continue;
    out[p.id] = { google: googleDirectionsUrl([prev, p]), apple: appleDirectionsUrl([prev, p]) };
  }
  return out;
}
