/**
 * Geocoding helpers — OpenStreetMap Nominatim for one-off lookups (saving a
 * place, reverse geocoding, button-press search) and Photon (komoot) for the
 * as-you-type place combobox (ADR 0069; Nominatim's policy forbids
 * autocomplete).
 *
 * Rules:
 * - Never throws; always returns null / { status: "error" } on any error.
 * - Uses an AbortController timeout so it doesn't block actions indefinitely.
 * - Sets a descriptive User-Agent header (required by Nominatim's usage policy;
 *   harmless to Photon).
 * - Memoises successful responses in-process by URL (ADR 0028). Failures —
 *   including a 2xx body of the wrong shape — are never cached, in-process or
 *   in Next's data cache.
 * - Nominatim requests also use Next's data cache (`next: { revalidate:
 *   GEOCODE_REVALIDATE_SECONDS }`); Photon's typeahead requests opt out of it
 *   (`cache: "no-store"`) so a malformed 2xx can't get stuck rejecting a query
 *   for up to 30 days — see `cachedFetchJson`.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// Nominatim's usage policy requires a REAL contact (email or the app's public
// URL) in the User-Agent, and it blocklists placeholder contacts such as
// "example.com" with HTTP 403. We therefore never send a placeholder: if
// NOMINATIM_CONTACT is unset we warn and omit the contact entirely. Configure
// NOMINATIM_CONTACT in every environment where geocoding must work.
const NOMINATIM_CONTACT = process.env.NOMINATIM_CONTACT?.trim() || null;

if (!NOMINATIM_CONTACT) {
  console.warn(
    "[geocode] NOMINATIM_CONTACT is not set. OpenStreetMap Nominatim requires a " +
      "real contact (email or app URL) in the User-Agent and blocks placeholder " +
      "contacts with HTTP 403. Location search and geocoding will likely fail " +
      "until NOMINATIM_CONTACT is configured.",
  );
}

const USER_AGENT = NOMINATIM_CONTACT
  ? `TripPlanner/1.0 (${NOMINATIM_CONTACT})`
  : "TripPlanner/1.0";
const TIMEOUT_MS = 5_000;
// The app is English-only. Ask Nominatim for English place names so search
// results and derived city/country are not returned in the local language
// (e.g. "Tokyo Tower", not "東京タワー"). Falls back to the local name only
// when no English name exists in OpenStreetMap.
const ACCEPT_LANGUAGE = "en";

export interface LatLng {
  lat: number;
  lng: number;
}

interface NominatimResult {
  lat: string;
  lon: string;
}

/**
 * Geocode a free-text place query using OpenStreetMap Nominatim.
 *
 * Returns `{ lat, lng }` on success, or `null` if the query returns no
 * results, the network request fails, or any other error occurs.
 */
export async function geocodePlace(query: string): Promise<LatLng | null> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);
  url.searchParams.set("accept-language", ACCEPT_LANGUAGE);

  const data = await cachedFetchJson(url.toString());
  if (!Array.isArray(data) || data.length === 0) return null;

  const { lat, lon } = data[0] as NominatimResult;
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lngNum)) return null;

  return { lat: latNum, lng: lngNum };
}

const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

/** A resolved place from Nominatim or Photon, with the address components we care about. */
export interface GeoCandidate {
  name: string;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
  countryCode: string | null;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  country?: string;
  country_code?: string;
}

interface NominatimDetailedResult {
  display_name?: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
}

/** Best-effort city/town from Nominatim's address components. */
function pickCity(address: NominatimAddress | undefined): string | null {
  if (!address) return null;
  return (
    address.city ??
    address.town ??
    address.village ??
    address.hamlet ??
    address.municipality ??
    null
  );
}

function toCandidate(r: NominatimDetailedResult): GeoCandidate | null {
  const lat = parseFloat(r.lat);
  const lng = parseFloat(r.lon);
  if (isNaN(lat) || isNaN(lng)) return null;
  return {
    name: r.display_name ?? "",
    lat,
    lng,
    city: pickCity(r.address),
    country: r.address?.country ?? null,
    countryCode: r.address?.country_code ?? null,
  };
}

// In-memory memo of successful Nominatim responses, keyed by request URL.
// Nominatim's usage policy asks callers to cache and not repeat identical
// queries. Geocoding results are stable, so entries live for the life of the
// server instance with no eviction — two-user volume makes growth a non-issue
// (mirrors the in-memory cache in lib/weather.ts). Only successful responses
// are stored; failures (network error, timeout, non-2xx, unparseable body) are
// never cached, so a transient outage never sticks and the next call retries.
/**
 * Next's data cache keeps a successful Nominatim answer this long across
 * serverless instances (spec 2026-10-06 §U); the in-memory map below stays as
 * the first level. Places don't move. Not `use cache` (needs cacheComponents).
 * Photon's typeahead requests opt OUT of Next's data cache entirely
 * (`cache: "no-store"`, see `cachedFetchJson`) — a malformed 2xx could
 * otherwise sit there rejecting every repeat of that query for up to 30 days;
 * only the in-memory map covers Photon, and only once a response has passed
 * its `accept` check.
 */
export const GEOCODE_REVALIDATE_SECONDS = 60 * 60 * 24 * 30;
const responseCache = new Map<string, unknown>();

/** Test-only seam: clear the in-memory response cache between cases. */
export function _resetGeocodeCacheForTests(): void {
  responseCache.clear();
}

// Nominatim asks for at most one request per second (ADR 0069).
// cachedFetchJson calls paceNominatim() immediately before each real
// Nominatim network fetch — never on an in-memory cache hit, never for
// Photon — so consecutive requests are ≥1 s apart and a cached repeat
// returns at once. Process-local: a reservation is taken synchronously, so
// concurrent callers in one instance queue up rather than racing. The first
// call — and any call over a second after the previous one — does not wait.
const NOMINATIM_MIN_GAP_MS = 1_000;
let nextNominatimSlot = 0;

export async function paceNominatim(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextNominatimSlot - now);
  nextNominatimSlot = Math.max(now, nextNominatimSlot) + NOMINATIM_MIN_GAP_MS;
  if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
}

/** Test-only seam: forget the last paced call. */
export function _resetNominatimPaceForTests(): void {
  nextNominatimSlot = 0;
}

function isNominatimUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "nominatim.openstreetmap.org";
  } catch {
    return false;
  }
}

/**
 * Fetch and parse JSON from a geocoder URL, memoising successful responses in
 * the in-memory `responseCache` by URL. Returns the parsed body on success
 * (HTTP 2xx + valid JSON + `accept` says the shape is right), or null on any
 * failure (which is NOT cached at either layer). Never throws.
 *
 * `revalidate` additionally controls Next's own fetch/data cache: a number
 * opts the request into `next: { revalidate }` (Nominatim's default — stable
 * results, safe to keep for up to `GEOCODE_REVALIDATE_SECONDS`); `false` opts
 * out with `cache: "no-store"` (Photon's typeahead — a malformed 2xx must
 * never sit in Next's cache rejecting every repeat of that query for up to 30
 * days; the in-memory `responseCache` above already skips it too, since it is
 * only populated after `accept` passes).
 */
async function cachedFetchJson(
  url: string,
  options: { accept?: (data: unknown) => boolean; revalidate?: number | false } = {},
): Promise<unknown | null> {
  const { accept = () => true, revalidate = GEOCODE_REVALIDATE_SECONDS } = options;
  if (responseCache.has(url)) return responseCache.get(url) ?? null;
  if (isNominatimUrl(url)) await paceNominatim();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      ...(revalidate === false ? { cache: "no-store" as const } : { next: { revalidate } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!accept(data)) return null;
    responseCache.set(url, data);
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Geocode a free-text place query, returning the single best-matching
 * `GeoCandidate` (with countryCode) or `null`. Use this in stop-write paths
 * where you need to persist `countryCode` alongside `lat`/`lng`.
 *
 * Never throws; returns null on any failure or empty result.
 */
export async function geocodePlaceDetailed(query: string): Promise<GeoCandidate | null> {
  const [first] = await searchPlaces(query, 1);
  return first ?? null;
}

/**
 * Result of a place search that distinguishes a genuine empty result
 * ("no matches") from a transport/HTTP/parse failure ("search unavailable").
 * Use this in interactive search UIs; use `searchPlaces` for best-effort paths.
 */
export type PlaceSearchOutcome =
  | { status: "ok"; candidates: GeoCandidate[] }
  | { status: "error" };

/**
 * Forward-search a free-text place query, returning an outcome that
 * distinguishes "no matches" (status "ok", empty candidates) from a request
 * failure (status "error"). Never throws.
 */
export async function searchPlacesWithStatus(
  query: string,
  limit = 5,
): Promise<PlaceSearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { status: "ok", candidates: [] };

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("q", trimmed);
  url.searchParams.set("accept-language", ACCEPT_LANGUAGE);

  const data = await cachedFetchJson(url.toString());
  if (!Array.isArray(data)) return { status: "error" };
  const candidates = (data as NominatimDetailedResult[])
    .map(toCandidate)
    .filter((c): c is GeoCandidate => c !== null);
  return { status: "ok", candidates };
}

// ---------------------------------------------------------------------------
// Photon (komoot) — the as-you-type place search (ADR 0069)
// ---------------------------------------------------------------------------

const PHOTON_URL = "https://photon.komoot.io/api";

interface PhotonProperties {
  name?: string;
  city?: string;
  town?: string;
  village?: string;
  locality?: string;
  country?: string;
  /** ISO 3166-1 alpha-2, upper-case in Photon's responses. */
  countrycode?: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: PhotonProperties;
}

function isPhotonFeatureCollection(data: unknown): data is { type: "FeatureCollection"; features: PhotonFeature[] } {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as { type?: unknown; features?: unknown };
  return d.type === "FeatureCollection" && Array.isArray(d.features);
}

/** Photon has no `display_name`: compose "name, city, country", blanks and repeats dropped. */
function photonToCandidate(feature: PhotonFeature): GeoCandidate | null {
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords; // GeoJSON order
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const p = feature.properties ?? {};
  const city = p.city ?? p.town ?? p.village ?? p.locality ?? null;
  const country = p.country ?? null;
  const parts: string[] = [];
  for (const part of [p.name, city, country]) {
    const t = part?.trim();
    if (t && !parts.includes(t)) parts.push(t);
  }
  return {
    name: parts.join(", "),
    lat,
    lng,
    city,
    country,
    countryCode: p.countrycode ? p.countrycode.toLowerCase() : null,
  };
}

/**
 * As-you-type place search on Photon (photon.komoot.io), built for
 * autocomplete. Same contract as `searchPlacesWithStatus`: never throws;
 * "error" on network error, timeout, non-2xx or a body that is not a GeoJSON
 * FeatureCollection; "ok" with [] on no match. No fallback to Nominatim on
 * error — that would recreate the policy violation (ADR 0069).
 */
export async function searchPlacesTypeahead(query: string, limit = 5): Promise<PlaceSearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { status: "ok", candidates: [] };

  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", ACCEPT_LANGUAGE);

  const data = await cachedFetchJson(url.toString(), { accept: isPhotonFeatureCollection, revalidate: false });
  if (!isPhotonFeatureCollection(data)) return { status: "error" };
  const candidates = data.features
    .map(photonToCandidate)
    .filter((c): c is GeoCandidate => c !== null);
  return { status: "ok", candidates };
}

/**
 * Best-effort forward search. Returns up to `limit` candidates, or [] on any
 * failure OR empty result. Kept for callers that don't need error-vs-empty
 * (e.g. geocodePlaceDetailed, background stop/accommodation geocoding).
 */
export async function searchPlaces(query: string, limit = 5): Promise<GeoCandidate[]> {
  const outcome = await searchPlacesWithStatus(query, limit);
  return outcome.status === "ok" ? outcome.candidates : [];
}

/**
 * Reverse-geocode a coordinate to a single named place with derived
 * city/country. Never throws; returns null on any failure.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoCandidate | null> {
  const url = new URL(NOMINATIM_REVERSE_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("accept-language", ACCEPT_LANGUAGE);

  const data = await cachedFetchJson(url.toString());
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const result = data as NominatimDetailedResult;
  if (!result.lat || !result.lon) return null;
  return toCandidate(result);
}
