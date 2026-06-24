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
}

/**
 * Build a Google Maps search URL.
 *
 * Preference order:
 *   1. lat + lng → `?query=<lat>,<lng>`
 *   2. address   → `?query=<encoded address>`
 *   3. label     → `?query=<encoded label>`
 *
 * Returns null if none of the above are available.
 */
export function mapsUrl({ lat, lng, address, label }: MapLinkParams): string | null {
  const base = "https://www.google.com/maps/search/?api=1&query=";

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
  const tokens = points.map(pointToken).filter((t): t is string => t != null);
  if (tokens.length < 2) return null;
  const origin = tokens[0];
  const destination = tokens[tokens.length - 1];
  const waypoints = tokens.slice(1, -1);
  const params = new URLSearchParams({ api: "1", origin, destination });
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
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
