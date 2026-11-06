import "server-only";
import type { LatLng } from "@/lib/geo";
import { mapsLink } from "@/lib/geocode";
import { fetchJson, finite, isRecord, serverKey } from "@/lib/google-fetch";
import type { OpeningHours } from "@/lib/opening-hours";
import { openingHoursFromGoogle, parseGooglePeriods } from "@/lib/opening-hours-google";
import type { NearbyKind } from "./kinds";
import { nearbyKind } from "./kinds";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby";
const FIELD_MASK =
  "places.id,places.displayName,places.location,places.formattedAddress,places.primaryTypeDisplayName,places.rating,places.userRatingCount,places.regularOpeningHours,places.currentOpeningHours,places.businessStatus,places.websiteUri,places.utcOffsetMinutes";
const RADIUS_M = 1500;
const MAX_RESULTS = 10;

export interface NearbyPlace {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  typeLabel: string | null;
  rating: number | null;
  ratingCount: number | null;
  utcOffsetMinutes: number | null;
  openNow: boolean | null;
  closesAt: string | null;
  openingHours: OpeningHours | null;
  businessStatus: string | null;
  website: string | null;
}

const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const labelOf = (v: unknown): string | null => (isRecord(v) ? text(v.text) : null);

function parsePlace(raw: unknown): NearbyPlace | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  const name = labelOf(raw.displayName);
  const location = isRecord(raw.location) ? raw.location : null;
  if (!name || !location || !finite(location.latitude) || !finite(location.longitude)) return null;
  if (raw.businessStatus === "CLOSED_PERMANENTLY") return null;
  const regular = isRecord(raw.regularOpeningHours) ? raw.regularOpeningHours : null;
  return {
    placeId: raw.id,
    name,
    lat: location.latitude,
    lng: location.longitude,
    address: text(raw.formattedAddress),
    typeLabel: labelOf(raw.primaryTypeDisplayName),
    rating: finite(raw.rating) ? raw.rating : null,
    ratingCount: finite(raw.userRatingCount) ? raw.userRatingCount : null,
    utcOffsetMinutes: finite(raw.utcOffsetMinutes) ? raw.utcOffsetMinutes : null,
    openNow: null,
    closesAt: null,
    openingHours: regular ? openingHoursFromGoogle(parseGooglePeriods(regular.periods), mapsLink(raw.id)) : null,
    businessStatus: text(raw.businessStatus),
    website: text(raw.websiteUri),
  };
}

export async function searchNearby(point: LatLng, kind: NearbyKind): Promise<NearbyPlace[] | null> {
  const key = serverKey();
  const spec = nearbyKind(kind);
  if (!key || !spec) return null;
  const res = await fetchJson(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      includedTypes: spec.includedTypes,
      maxResultCount: MAX_RESULTS,
      rankPreference: "POPULARITY",
      languageCode: "en",
      locationRestriction: { circle: { center: { latitude: point.lat, longitude: point.lng }, radius: RADIUS_M } },
    }),
  });
  if (!res.ok || !isRecord(res.body)) return null;
  const places = Array.isArray(res.body.places) ? res.body.places : [];
  return places.map(parsePlace).filter((p): p is NearbyPlace => p !== null);
}
