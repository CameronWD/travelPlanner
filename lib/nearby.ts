import { haversineKm, type LatLng } from "@/lib/geo";

export const NEARBY_RADIUS_KM = 1.5;

export interface NearbyCandidate { id: string; title: string; category: string; lat: number; lng: number }
export interface NearbyResult { id: string; title: string; category: string; distanceKm: number }

/** Located wishlist candidates within `radiusKm` of ANY anchor point, nearest first. */
export function nearbyWishlistItems(input: {
  anchors: LatLng[];
  candidates: NearbyCandidate[];
  radiusKm?: number;
}): NearbyResult[] {
  const radius = input.radiusKm ?? NEARBY_RADIUS_KM;
  if (input.anchors.length === 0) return [];
  const out: NearbyResult[] = [];
  for (const c of input.candidates) {
    let best = Infinity;
    for (const a of input.anchors) {
      const d = haversineKm(a, { lat: c.lat, lng: c.lng });
      if (d < best) best = d;
    }
    if (best <= radius) out.push({ id: c.id, title: c.title, category: c.category, distanceKm: best });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Radius for "near the Stop" on a free-form day (CONTEXT.md "Day ideas"). */
export const STOP_NEARBY_RADIUS_KM = 30;

export interface DayIdeaCandidate {
  id: string;
  title: string;
  category: string;
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
}

export type DayIdeaReason = "nearby" | "country" | "unlocated";

export interface DayIdeaResult {
  id: string;
  title: string;
  category: string;
  distanceKm: number | null;
  reason: DayIdeaReason;
}

/**
 * Wishlist ideas worth surfacing as Day ideas for a free-form day (CONTEXT.md
 * "Day ideas"): drawn only from the Travellers' own Wishlist pool, never
 * fetched from outside. A located candidate within `radiusKm` of the Stop is
 * "nearby"; failing that, a candidate whose countryCode matches the Stop's is
 * a "country" match; failing that, a candidate with neither a location nor a
 * countryCode is "unlocated" (it surfaces everywhere rather than nowhere).
 * Anything provably elsewhere — located far away, or a country mismatch — is
 * excluded.
 */
export function dayIdeasWishlist(input: {
  stop: { lat: number | null; lng: number | null; countryCode: string | null };
  candidates: DayIdeaCandidate[];
  radiusKm?: number;
}): DayIdeaResult[] {
  const radius = input.radiusKm ?? STOP_NEARBY_RADIUS_KM;
  const stopCC = input.stop.countryCode?.toLowerCase() ?? null;
  const stopLoc =
    input.stop.lat != null && input.stop.lng != null
      ? { lat: input.stop.lat, lng: input.stop.lng }
      : null;

  const nearby: DayIdeaResult[] = [];
  const country: DayIdeaResult[] = [];
  const unlocated: DayIdeaResult[] = [];

  for (const c of input.candidates) {
    const located = c.lat != null && c.lng != null;
    const cc = c.countryCode?.toLowerCase() ?? null;
    const distanceKm =
      located && stopLoc ? haversineKm(stopLoc, { lat: c.lat!, lng: c.lng! }) : null;

    if (distanceKm != null && distanceKm <= radius) {
      nearby.push({ id: c.id, title: c.title, category: c.category, distanceKm, reason: "nearby" });
    } else if (cc && stopCC && cc === stopCC) {
      country.push({ id: c.id, title: c.title, category: c.category, distanceKm, reason: "country" });
    } else if (!located && !cc) {
      unlocated.push({ id: c.id, title: c.title, category: c.category, distanceKm: null, reason: "unlocated" });
    }
    // located far away, or a country mismatch: provably elsewhere — excluded.
  }

  nearby.sort((a, b) => a.distanceKm! - b.distanceKm!);
  const byTitle = (a: DayIdeaResult, b: DayIdeaResult) => a.title.localeCompare(b.title);
  country.sort(byTitle);
  unlocated.sort(byTitle);
  return [...nearby, ...country, ...unlocated];
}
