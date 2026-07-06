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
// Nominatim's usage policy asks for a contact in the User-Agent. Configure a
// real contact via NOMINATIM_CONTACT in production; the default avoids baking a
// personal email into the source.
const NOMINATIM_CONTACT =
  process.env.NOMINATIM_CONTACT ?? "contact@example.com";
const USER_AGENT = `TripPlanner/1.0 (${NOMINATIM_CONTACT})`;
const TIMEOUT_MS = 5_000;

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
 * Forward-search a free-text place query, returning up to `limit` candidates
 * with derived city/country. Never throws; returns [] on any failure.
 */
export async function searchPlaces(query: string, limit = 5): Promise<GeoCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("q", trimmed);

  const data = await fetchJson(url.toString());
  if (!Array.isArray(data)) return [];
  return (data as NominatimDetailedResult[])
    .map(toCandidate)
    .filter((c): c is GeoCandidate => c !== null);
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

  const data = await fetchJson(url.toString());
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const result = data as NominatimDetailedResult;
  if (!result.lat || !result.lon) return null;
  return toCandidate(result);
}
