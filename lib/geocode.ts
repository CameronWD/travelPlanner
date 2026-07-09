/**
 * Geocoding helper — wraps the OpenStreetMap Nominatim search API.
 *
 * Rules:
 * - Never throws; always returns null on any error or empty result.
 * - Uses an AbortController timeout so it doesn't block actions indefinitely.
 * - Sets a descriptive User-Agent header (required by Nominatim's usage policy).
 * - Never called in tests — the consumer mocks `fetch`.
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("q", query);
    url.searchParams.set("accept-language", ACCEPT_LANGUAGE);

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as NominatimResult[];
    if (!Array.isArray(data) || data.length === 0) return null;

    const { lat, lon } = data[0];
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lon);

    if (isNaN(latNum) || isNaN(lngNum)) return null;

    return { lat: latNum, lng: lngNum };
  } catch {
    // Network error, abort, JSON parse error, etc. — all return null.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

/** A resolved place from Nominatim, with the address components we care about. */
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

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return { status: "error" };
    const data = await res.json();
    if (!Array.isArray(data)) return { status: "error" };
    const candidates = (data as NominatimDetailedResult[])
      .map(toCandidate)
      .filter((c): c is GeoCandidate => c !== null);
    return { status: "ok", candidates };
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timer);
  }
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

  const data = await fetchJson(url.toString());
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const result = data as NominatimDetailedResult;
  if (!result.lat || !result.lon) return null;
  return toCandidate(result);
}
