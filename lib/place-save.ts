import type { LatLng } from "@/lib/geo";
import type { GeoCandidate } from "@/lib/geocode";

export interface SavedPlace {
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
  region: string | null;
  placeId: string | null;
}

export const NO_PLACE: SavedPlace = { lat: null, lng: null, countryCode: null, region: null, placeId: null };

export function pointOf(row: { lat: number | null; lng: number | null }): LatLng | undefined {
  return row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : undefined;
}

export type PlaceSource = "pick" | "kept" | "looked-up" | "none";

// A pick carries its place ID and point together; anything less is typed text.
export function pickedPlace(input: { placeId?: string; lat?: number; lng?: number; countryCode?: string; region?: string }): SavedPlace | null {
  if (input.placeId == null || input.lat == null || input.lng == null) return null;
  return { placeId: input.placeId, lat: input.lat, lng: input.lng, countryCode: input.countryCode?.toLowerCase() ?? null, region: input.region ?? null };
}

// Every Google lookup is billed, so a located row whose text is unchanged keeps its place.
export async function placeForSave({
  text,
  pick,
  before,
  lookUp,
}: {
  text: string | null;
  pick: SavedPlace | null;
  before?: { text: string | null; place: SavedPlace } | null;
  lookUp: (text: string) => Promise<GeoCandidate | null>;
}): Promise<{ place: SavedPlace; source: PlaceSource }> {
  if (pick) return { place: pick, source: "pick" };
  if (before && (before.text || null) === (text || null) && before.place.lat != null && before.place.lng != null) {
    return { place: before.place, source: "kept" };
  }
  if (!text) return { place: NO_PLACE, source: "none" };
  return { place: foundPlace(await lookUp(text)) ?? NO_PLACE, source: "looked-up" };
}

export function foundPlace(found: GeoCandidate | null): SavedPlace | null {
  return found && { lat: found.lat, lng: found.lng, countryCode: found.countryCode?.toLowerCase() ?? null, region: found.region ?? null, placeId: found.placeId };
}
