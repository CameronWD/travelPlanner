/**
 * The zone at a point (spec 2026-10-16 F3): the one module that imports the
 * offline lookup table (`@photostructure/tz-lookup`, ~80 KB). Server code
 * imports it; client code loads it with `import("@/lib/tz-point")` only when
 * a place is picked, so no main bundle carries the table (a static import
 * from components/ or app/ is an ESLint error). The rule that decides
 * between a chosen zone, this one and the country's is `stopTimezone` /
 * `homeBaseTimezone` in lib/tz.ts, which stays pure.
 */
import tzlookup from "@photostructure/tz-lookup";
import { homeBaseTimezone, isValidTimeZone, stopTimezone } from "@/lib/tz";

/**
 * The IANA zone at `lat`/`lng`, or null when there is no point, the lookup
 * refuses it, or the point is at sea (the lookup answers `Etc/GMT±N` there,
 * which is a nautical offset, not a place's zone) — the country decides then.
 */
export function pointTimezone(lat?: number | null, lng?: number | null): string | null {
  if (lat == null || lng == null) return null;
  let zone: string;
  try {
    zone = tzlookup(lat, lng);
  } catch {
    return null;
  }
  if (zone.startsWith("Etc/") || !isValidTimeZone(zone)) return null;
  return zone;
}

/** `stopTimezone` with the zone at the Stop's point looked up — every server-side Stop write. */
export function resolveStopTimezone(stop: {
  timezone?: string | null;
  countryCode?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string {
  return stopTimezone({ ...stop, pointZone: pointTimezone(stop.lat, stop.lng) });
}

/** `homeBaseTimezone` with the zone at the Home point looked up — createTrip and updateTrip. */
export function resolveHomeTimezone(home: {
  timezone?: string | null;
  countryCode?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string | null {
  return homeBaseTimezone({ timezone: home.timezone, countryCode: home.countryCode, pointZone: pointTimezone(home.lat, home.lng) });
}
