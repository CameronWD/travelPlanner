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
