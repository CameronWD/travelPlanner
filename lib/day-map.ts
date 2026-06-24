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

import { googleDirectionsUrl, appleDirectionsUrl } from "@/lib/maps";

export type DayMapPointKind = "item" | "accommodation" | "transport-dep" | "transport-arr";

export interface DayMapPoint {
  kind: DayMapPointKind;
  id: string;
  lat: number;
  lng: number;
  label: string;
  order?: number;
  address?: string | null;
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
}

export interface DayMapAccommodationInput {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}

export interface DayMapTransportInput {
  id: string;
  depPlace?: string | null;
  arrPlace?: string | null;
  depLat?: number | null;
  depLng?: number | null;
  arrLat?: number | null;
  arrLng?: number | null;
}

// ---------------------------------------------------------------------------
// Output interface
// ---------------------------------------------------------------------------

export interface DayMapModel {
  points: DayMapPoint[];
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
      });
    }
    if (isLocated(transport.arrLat, transport.arrLng)) {
      transportPoints.push({
        kind: "transport-arr",
        id: transport.id,
        lat: transport.arrLat as number,
        lng: transport.arrLng as number,
        label: transport.arrPlace ?? "Arrival",
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

// ---------------------------------------------------------------------------
// Per-item directions helper
// ---------------------------------------------------------------------------

/** Per-item directions URLs from the previous located point to each located item. */
export function buildItemDirections(
  model: DayMapModel,
): Record<string, { google: string | null; apple: string | null }> {
  const out: Record<string, { google: string | null; apple: string | null }> = {};
  for (const p of model.points) {
    if (p.kind !== "item") continue;
    const prev = model.perItemPrev[p.id];
    if (!prev) continue;
    out[p.id] = { google: googleDirectionsUrl([prev, p]), apple: appleDirectionsUrl([prev, p]) };
  }
  return out;
}
