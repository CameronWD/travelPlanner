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
