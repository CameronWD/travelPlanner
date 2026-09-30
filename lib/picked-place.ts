import type { GeoCandidate } from "@/lib/geocode";
import { haversineKm } from "@/lib/geo";

export interface PickedPlace {
  name: string;
  /** "New South Wales, Australia" — tells two Sydneys apart. */
  region?: string;
  lat: number;
  lng: number;
  /** ISO 3166-1 alpha-2, lower-case (as Stop.countryCode stores it). */
  countryCode?: string;
}

export function toPickedPlace(c: GeoCandidate): PickedPlace | null {
  const parts = c.name.split(",").map((p) => p.trim()).filter(Boolean);
  const name = parts[0] ?? c.city ?? "";
  if (!name) return null;
  // Nominatim's display_name runs place → districts → state → postcode → country.
  const rest = parts.slice(1).filter((p) => !/\d/.test(p));
  const region = rest.slice(-2).join(", ");
  return {
    name,
    ...(region ? { region } : {}),
    lat: c.lat,
    lng: c.lng,
    ...(c.countryCode ? { countryCode: c.countryCode.toLowerCase() } : {}),
  };
}

export function pickedPlaces(cs: GeoCandidate[], rankNear?: { lat: number; lng: number }): PickedPlace[] {
  const seen = new Set<string>();
  const out: PickedPlace[] = [];
  for (const c of cs) {
    const p = toPickedPlace(c);
    if (!p) continue;
    const key = `${p.name}|${p.region ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  if (!rankNear) return out;
  return out
    .map((p, i) => ({ p, i, d: haversineKm(rankNear, p) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.p);
}
