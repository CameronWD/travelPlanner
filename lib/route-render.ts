/**
 * Pure projection for the stylised "route render" cover fallback. Maps stop
 * coordinates into an SVG viewbox (equirectangular, north-up), normalised to
 * the bounding box of the stops with uniform padding. Deterministic, no I/O.
 */
export interface LatLng {
  lat: number;
  lng: number;
}
export interface Point {
  x: number;
  y: number;
}

export function projectStops(
  stops: LatLng[],
  width: number,
  height: number,
  pad: number,
): Point[] {
  if (stops.length === 0) return [];

  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);

  if (stops.length === 1) {
    return [{ x: width / 2, y: height / 2 }];
  }

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const s of stops) {
    minLat = Math.min(minLat, s.lat);
    maxLat = Math.max(maxLat, s.lat);
    minLng = Math.min(minLng, s.lng);
    maxLng = Math.max(maxLng, s.lng);
  }
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;

  return stops.map((s) => ({
    // lng increases left→right
    x: pad + ((s.lng - minLng) / spanLng) * innerW,
    // lat increases bottom→top (north-up) ⇒ invert for SVG y-down
    y: pad + (1 - (s.lat - minLat) / spanLat) * innerH,
  }));
}

/**
 * Ordered points for the cover route path: home base bookends the itinerary —
 * always at the start, and at the end too on a round trip (mirrors the Summary
 * map, ADR 0032). No home base → the stops unchanged.
 */
export function orderedRoutePoints(
  stops: LatLng[],
  home: LatLng | null,
  roundTrip: boolean,
): LatLng[] {
  if (!home) return stops;
  return roundTrip ? [home, ...stops, home] : [home, ...stops];
}
