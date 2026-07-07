import { haversineKm } from "@/lib/geo";
import type { MarkerView } from "@/components/globe/types";

/** A Trip Stop's location fields relevant to Globe-overlap matching. */
export interface TripStopLocation {
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
}

export interface SuggestMarkersInput {
  markers: MarkerView[];
  stops: TripStopLocation[];
  addedMarkerIds: string[];
}

/**
 * Markers that overlap where the Trip is going (ADR 0025).
 *
 * Country decides INCLUSION: a Marker is suggested iff its ISO countryCode
 * (case-insensitive) matches any Stop's countryCode. Proximity only ORDERS the
 * result — nearest stop-coordinate first; markers with no coordinates (or when
 * no stop has coordinates) sort last, keeping their input order. Already-added
 * markers are excluded.
 */
export function suggestMarkersForTrip(input: SuggestMarkersInput): MarkerView[] {
  const stopCodes = new Set(
    input.stops
      .map((s) => s.countryCode?.toLowerCase())
      .filter((c): c is string => Boolean(c)),
  );
  if (stopCodes.size === 0) return [];

  const added = new Set(input.addedMarkerIds);
  const stopCoords = input.stops.filter(
    (s): s is TripStopLocation & { lat: number; lng: number } => s.lat != null && s.lng != null,
  );

  const matched = input.markers
    .map((marker, index) => ({ marker, index }))
    .filter(
      ({ marker }) =>
        !added.has(marker.id) &&
        marker.countryCode != null &&
        stopCodes.has(marker.countryCode.toLowerCase()),
    );

  const distanceOf = (marker: MarkerView): number => {
    if (marker.lat == null || marker.lng == null || stopCoords.length === 0) return Infinity;
    let best = Infinity;
    for (const s of stopCoords) {
      const d = haversineKm({ lat: s.lat, lng: s.lng }, { lat: marker.lat, lng: marker.lng });
      if (d < best) best = d;
    }
    return best;
  };

  return matched
    .map((entry) => ({ ...entry, distance: distanceOf(entry.marker) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map((entry) => entry.marker);
}
