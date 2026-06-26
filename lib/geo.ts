/**
 * Pure geographic helpers for the Trip Planner.
 *
 * No framework, no network, no Prisma. Fully unit-testable.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance between two lat/lng points using the Haversine formula.
 *
 * Returns the distance in kilometres. Both points must have valid lat/lng values.
 * Accurate to within ~0.5% for typical travel distances.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Estimated road distance (km) for a straight-line distance, scaled by a winding factor. */
export function estimateRoadKm(straightLineKm: number, windingFactor: number): number {
  return straightLineKm * windingFactor;
}

/**
 * Rough driving time in MINUTES for a straight-line distance, using a winding
 * factor (straight-line → road) and an average speed. Pure + offline — a hint,
 * not an ETA. Returns 0 for a non-positive speed (avoids Infinity/NaN).
 */
export function estimateDriveMinutes(
  straightLineKm: number,
  opts: { windingFactor: number; avgSpeedKph: number },
): number {
  if (opts.avgSpeedKph <= 0) return 0;
  const roadKm = estimateRoadKm(straightLineKm, opts.windingFactor);
  return (roadKm / opts.avgSpeedKph) * 60;
}
