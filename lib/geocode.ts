import "server-only";
import { haversineKm, type LatLng } from "@/lib/geo";
import type { OpeningHours } from "@/lib/opening-hours";
import { openingHoursFromGoogle, parseGooglePeriods } from "@/lib/opening-hours-google";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_URL = "https://places.googleapis.com/v1/places";
const TIMEOUT_MS = 5_000;
const LANGUAGE = "en";
const NEAR_BOUNDS_DEG = 0.5;
const NEAR_BIAS_RADIUS_M = 50_000;

export const VENUE_GUARD_KM = 0.5;

export interface GeoCandidate {
  name: string;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  placeId: string | null;
  address: string | null;
}

export interface VenueMatch extends GeoCandidate {
  matched: "venue" | "address";
}

export type Lookup<T> = { status: "ok"; candidate: T } | { status: "miss" } | { status: "error" };

const MISS = { status: "miss" } as const;
const ERROR = { status: "error" } as const;

function found(candidate: GeoCandidate | null): Lookup<GeoCandidate> {
  return candidate ? { status: "ok", candidate } : MISS;
}

function candidateOf<T>(lookup: Lookup<T>): T | null {
  return lookup.status === "ok" ? lookup.candidate : null;
}

export interface VenueDetails {
  openingHours: OpeningHours | null;
  website: string | null;
  businessStatus: string | null;
}

interface Component {
  text: string;
  short: string;
  types: string[];
}

const REGION_TYPES = new Set([
  "locality",
  "sublocality",
  "postal_town",
  "colloquial_area",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "country",
]);
const CITY_TYPES = ["locality", "postal_town", "administrative_area_level_3"];

function serverKey(): string | null {
  return process.env.GOOGLE_MAPS_SERVER_KEY?.trim() || null;
}

export function hasServerKey(): boolean {
  return serverKey() !== null;
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function readComponents(raw: unknown, textKey: string, shortKey: string): Component[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((c) => ({
    text: typeof c[textKey] === "string" ? c[textKey] : "",
    short: typeof c[shortKey] === "string" ? c[shortKey] : "",
    types: Array.isArray(c.types) ? c.types.filter((t): t is string => typeof t === "string") : [],
  }));
}

function buildCandidate(p: {
  lat: unknown;
  lng: unknown;
  address: unknown;
  placeId: unknown;
  types: unknown;
  components: Component[];
}): GeoCandidate | null {
  if (!finite(p.lat) || !finite(p.lng)) return null;
  const address = typeof p.address === "string" && p.address.trim() ? p.address.trim() : null;
  const types = Array.isArray(p.types) ? p.types : [];
  const isRegion = types.some((t) => REGION_TYPES.has(t));
  const country = p.components.find((c) => c.types.includes("country"));
  const cityType = CITY_TYPES.find((t) => p.components.some((c) => c.types.includes(t)));
  const city = cityType ? p.components.find((c) => c.types.includes(cityType))?.text || null : null;
  return {
    name: (isRegion ? address?.split(",")[0]?.trim() : address) ?? "",
    lat: p.lat,
    lng: p.lng,
    city,
    country: country?.text || null,
    countryCode: country?.short ? country.short.toLowerCase() : null,
    placeId: typeof p.placeId === "string" && p.placeId ? p.placeId : null,
    address,
  };
}

async function geocode(params: Record<string, string>): Promise<Lookup<GeoCandidate>> {
  const key = serverKey();
  if (!key) return ERROR;
  const url = new URL(GEOCODE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("language", LANGUAGE);
  url.searchParams.set("key", key);
  const data = await fetchJson(url.toString());
  if (!isRecord(data)) return ERROR;
  if (data.status === "ZERO_RESULTS") return MISS;
  if (data.status !== "OK" || !Array.isArray(data.results)) return ERROR;
  const first = data.results[0];
  if (!isRecord(first)) return MISS;
  const location = isRecord(first.geometry) && isRecord(first.geometry.location) ? first.geometry.location : {};
  return found(
    buildCandidate({
      lat: location.lat,
      lng: location.lng,
      address: first.formatted_address,
      placeId: first.place_id,
      types: first.types,
      components: readComponents(first.address_components, "long_name", "short_name"),
    }),
  );
}

export async function lookUpPlace(query: string, opts: { near?: LatLng } = {}): Promise<Lookup<GeoCandidate>> {
  const address = query.trim();
  if (!address) return MISS;
  const params: Record<string, string> = { address };
  if (opts.near) {
    const { lat, lng } = opts.near;
    params.bounds = `${lat - NEAR_BOUNDS_DEG},${lng - NEAR_BOUNDS_DEG}|${lat + NEAR_BOUNDS_DEG},${lng + NEAR_BOUNDS_DEG}`;
  }
  return geocode(params);
}

export async function geocodePlaceDetailed(query: string, opts: { near?: LatLng } = {}): Promise<GeoCandidate | null> {
  return candidateOf(await lookUpPlace(query, opts));
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoCandidate | null> {
  return candidateOf(await geocode({ latlng: `${lat},${lng}` }));
}

async function placeDetails(placeId: string, fieldMask: string, key: string): Promise<Record<string, unknown> | null> {
  const url = new URL(`${PLACES_URL}/${encodeURIComponent(placeId)}`);
  url.searchParams.set("languageCode", LANGUAGE);
  const data = await fetchJson(url.toString(), {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": fieldMask },
  });
  return isRecord(data) && typeof data.id === "string" ? data : null;
}

async function findVenue(textQuery: string, near: LatLng | undefined, key: string): Promise<Lookup<GeoCandidate>> {
  const body = near
    ? { textQuery, locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: NEAR_BIAS_RADIUS_M } } }
    : { textQuery };
  const search = await fetchJson(`${PLACES_URL}:searchText`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id" },
    body: JSON.stringify(body),
  });
  if (!isRecord(search)) return ERROR;
  const first = Array.isArray(search.places) ? search.places[0] : null;
  if (!isRecord(first) || typeof first.id !== "string") return MISS;
  const place = await placeDetails(first.id, "id,location,formattedAddress,addressComponents", key);
  if (!place) return ERROR;
  const location = isRecord(place.location) ? place.location : {};
  return found(
    buildCandidate({
      lat: location.latitude,
      lng: location.longitude,
      address: place.formattedAddress,
      placeId: place.id,
      types: [],
      components: readComponents(place.addressComponents, "longText", "shortText"),
    }),
  );
}

// Only Google answering "no such address" (or no address to ask about) lets a venue through unchecked; a failed lookup is not that answer.
export async function lookUpVenue(title: string, address: string, opts: { near?: LatLng } = {}): Promise<Lookup<VenueMatch>> {
  const key = serverKey();
  if (!key) return ERROR;
  const textQuery = [title.trim(), address.trim()].filter(Boolean).join(", ");
  if (!textQuery) return MISS;
  const [venue, place] = await Promise.all([findVenue(textQuery, opts.near, key), lookUpPlace(address, opts)]);
  if (venue.status === "error" || place.status === "error") return ERROR;
  if (venue.status === "miss") return place.status === "ok" ? { status: "ok", candidate: { ...place.candidate, matched: "address" } } : MISS;
  if (place.status === "miss" || haversineKm(venue.candidate, place.candidate) <= VENUE_GUARD_KM) {
    return { status: "ok", candidate: { ...venue.candidate, matched: "venue" } };
  }
  return { status: "ok", candidate: { ...place.candidate, matched: "address" } };
}

export async function locateVenue(title: string, address: string, opts: { near?: LatLng } = {}): Promise<VenueMatch | null> {
  return candidateOf(await lookUpVenue(title, address, opts));
}

// The field mask has no address, and the Maps URL requires a query, so the place ID serves as both.
const mapsLink = (placeId: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeId)}&query_place_id=${encodeURIComponent(placeId)}`;

export async function fetchVenueDetails(placeId: string): Promise<VenueDetails | null> {
  const key = serverKey();
  if (!key) return null;
  const place = await placeDetails(placeId, "id,regularOpeningHours,websiteUri,businessStatus", key);
  if (!place) return null;
  const hours = isRecord(place.regularOpeningHours) ? place.regularOpeningHours : null;
  const periods = hours ? parseGooglePeriods(hours.periods) : null;
  return {
    openingHours: openingHoursFromGoogle(periods, mapsLink(placeId)),
    website: typeof place.websiteUri === "string" && place.websiteUri ? place.websiteUri : null,
    businessStatus: typeof place.businessStatus === "string" && place.businessStatus ? place.businessStatus : null,
  };
}
