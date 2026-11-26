import type { LocalMode } from "@/lib/travel-times/hops";

/**
 * Pure map/directions URL builders.
 *
 * No React, no network — fully unit-testable.
 */

export interface MapLinkParams {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  label?: string | null;
  placeId?: string | null;
}

/**
 * Build a Google Maps search URL.
 *
 * Without a placeId, `query` prefers:
 *   1. lat + lng → `<lat>,<lng>`
 *   2. address   → `<encoded address>`
 *   3. label     → `<encoded label>`
 *
 * With a placeId, `query` (required by Maps URLs, shown only as a fallback)
 * prefers label → address → lat,lng, and `query_place_id` opens the venue.
 *
 * Returns null if no query text is available.
 */
export function mapsUrl({ lat, lng, address, label, placeId }: MapLinkParams): string | null {
  const base = "https://www.google.com/maps/search/?api=1&query=";

  if (placeId) {
    const query = label || address || (lat != null && lng != null ? `${lat},${lng}` : null);
    if (!query) return null;
    return `${base}${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(placeId)}`;
  }

  if (lat != null && lng != null) {
    return `${base}${encodeURIComponent(`${lat},${lng}`)}`;
  }

  const text = address || label;
  if (text) {
    return `${base}${encodeURIComponent(text)}`;
  }

  return null;
}

/**
 * Build an Apple Maps URL.
 *
 * Preference order:
 *   1. lat + lng → `?ll=<lat>,<lng>&q=<label or coords>`
 *   2. address   → `?q=<encoded address>`
 *   3. label     → `?q=<encoded label>`
 *
 * Returns null if none of the above are available.
 */
export function appleMapsUrl({ lat, lng, address, label }: MapLinkParams): string | null {
  const base = "https://maps.apple.com/";

  if (lat != null && lng != null) {
    const q = label || `${lat},${lng}`;
    return `${base}?ll=${encodeURIComponent(`${lat},${lng}`)}&q=${encodeURIComponent(q)}`;
  }

  const text = address || label;
  if (text) {
    return `${base}?q=${encodeURIComponent(text)}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Multi-stop directions builders
// ---------------------------------------------------------------------------

export interface DirectionsPoint {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  label?: string | null;
  placeId?: string | null;
}

/** A point renders as "lat,lng" when coords exist, else its address/label text. Null if neither. */
function pointToken(p: DirectionsPoint): string | null {
  if (p.lat != null && p.lng != null) return `${p.lat},${p.lng}`;
  return p.address || p.label || null;
}

/**
 * Google Maps multi-stop directions URL through the points in order
 * (origin = first, destination = last, waypoints = the middle). Returns null
 * if fewer than 2 points resolve to a usable token.
 */
export function googleDirectionsUrl(points: DirectionsPoint[]): string | null {
  const usable = points.map((p) => ({ token: pointToken(p), placeId: p.placeId ?? "" })).filter((p) => p.token != null);
  if (usable.length < 2) return null;
  const tokens = usable.map((p) => p.token as string);
  const origin = tokens[0];
  const destination = tokens[tokens.length - 1];
  const waypoints = tokens.slice(1, -1);
  const params = new URLSearchParams({ api: "1", origin, destination });
  if (usable[0].placeId) params.set("origin_place_id", usable[0].placeId);
  if (usable[usable.length - 1].placeId) params.set("destination_place_id", usable[usable.length - 1].placeId);
  if (waypoints.length) {
    params.set("waypoints", waypoints.join("|"));
    const ids = usable.slice(1, -1).map((p) => p.placeId);
    if (ids.every(Boolean)) params.set("waypoint_place_ids", ids.join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Apple Maps directions URL. Apple does not reliably support intermediate
 * waypoints, so a multi-point route degrades to first→last (saddr/daddr).
 * Returns null if fewer than 2 points resolve.
 */
export function appleDirectionsUrl(points: DirectionsPoint[]): string | null {
  const tokens = points.map(pointToken).filter((t): t is string => t != null);
  if (tokens.length < 2) return null;
  const params = new URLSearchParams({ saddr: tokens[0], daddr: tokens[tokens.length - 1] });
  return `https://maps.apple.com/?${params.toString()}`;
}

const GOOGLE_TRAVEL_MODE: Record<LocalMode, string> = { DRIVE: "driving", TRANSIT: "transit", WALK: "walking" };

/**
 * Directions to a destination from wherever the Traveller is standing: no
 * origin is sent, so both apps start from the device's current location.
 * An unset Local travel mode is transit, the same default the travel times use.
 */
export function directionsFromHereUrl(
  dest: { lat: number; lng: number } | { address: string },
  mode: LocalMode | null,
): { google: string; apple: string } {
  const destination = "address" in dest ? dest.address : `${dest.lat},${dest.lng}`;
  const google = new URLSearchParams({ api: "1", destination, travelmode: GOOGLE_TRAVEL_MODE[mode ?? "TRANSIT"] });
  const apple = new URLSearchParams({ daddr: destination, dirflg: mode === "DRIVE" ? "d" : mode === "WALK" ? "w" : "r" });
  return {
    google: `https://www.google.com/maps/dir/?${google.toString()}`,
    apple: `https://maps.apple.com/?${apple.toString()}`,
  };
}

export function directionsBackUrl(
  accommodation: { lat?: number | null; lng?: number | null; address?: string | null } | null,
  mode: LocalMode | null,
): string | null {
  if (!accommodation) return null;
  if (accommodation.lat != null && accommodation.lng != null) {
    return directionsFromHereUrl({ lat: accommodation.lat, lng: accommodation.lng }, mode).google;
  }
  if (accommodation.address) return directionsFromHereUrl({ address: accommodation.address }, mode).google;
  return null;
}
