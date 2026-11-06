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
  "places.id,places.displayName,places.location,places.formattedAddress,places.primaryTypeDisplayName,places.rating,places.userRatingCount,places.regularOpeningHours,places.currentOpeningHours,places.businessStatus,places.websiteUri";
const RADIUS_M = 1500;
const MAX_RESULTS = 10;
const MAX_UTC_OFFSET_MIN = 14 * 60;
const MIN_UTC_OFFSET_MIN = -12 * 60;

export interface NearbyPlace {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  typeLabel: string | null;
  rating: number | null;
  ratingCount: number | null;
  openNow: boolean | null;
  closesAt: string | null;
  openingHours: OpeningHours | null;
  businessStatus: string | null;
  website: string | null;
}

const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const labelOf = (v: unknown): string | null => (isRecord(v) ? text(v.text) : null);

// The field mask has no UTC offset, so the place's local close time is read off the one period whose local close is a legal UTC offset away from nextCloseTime; two such periods and it stays unknown.
function closesAtOf(current: Record<string, unknown>): string | null {
  if (current.openNow !== true || typeof current.nextCloseTime !== "string" || !Array.isArray(current.periods)) return null;
  const next = Date.parse(current.nextCloseTime);
  if (!Number.isFinite(next)) return null;
  const clocks = new Set<string>();
  for (const period of current.periods) {
    const close = isRecord(period) && isRecord(period.close) ? period.close : null;
    const date = close && isRecord(close.date) ? close.date : null;
    if (!close || !date || !finite(date.year) || !finite(date.month) || !finite(date.day)) continue;
    const hour = finite(close.hour) ? close.hour : 0;
    const minute = finite(close.minute) ? close.minute : 0;
    const offsetMin = (Date.UTC(date.year, date.month - 1, date.day, hour, minute) - next) / 60_000;
    if (offsetMin % 15 !== 0 || offsetMin < MIN_UTC_OFFSET_MIN || offsetMin > MAX_UTC_OFFSET_MIN) continue;
    clocks.add(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }
  return clocks.size === 1 ? [...clocks][0] : null;
}

function parsePlace(raw: unknown): NearbyPlace | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  const name = labelOf(raw.displayName);
  const location = isRecord(raw.location) ? raw.location : null;
  if (!name || !location || !finite(location.latitude) || !finite(location.longitude)) return null;
  if (raw.businessStatus === "CLOSED_PERMANENTLY") return null;
  const regular = isRecord(raw.regularOpeningHours) ? raw.regularOpeningHours : null;
  const current = isRecord(raw.currentOpeningHours) ? raw.currentOpeningHours : null;
  return {
    placeId: raw.id,
    name,
    lat: location.latitude,
    lng: location.longitude,
    address: text(raw.formattedAddress),
    typeLabel: labelOf(raw.primaryTypeDisplayName),
    rating: finite(raw.rating) ? raw.rating : null,
    ratingCount: finite(raw.userRatingCount) ? raw.userRatingCount : null,
    openNow: current && typeof current.openNow === "boolean" ? current.openNow : null,
    closesAt: current ? closesAtOf(current) : null,
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
