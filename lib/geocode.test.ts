import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocodePlaceDetailed, reverseGeocode, locateVenue, lookUpPlace, lookUpVenue, fetchVenueDetails, VENUE_GUARD_KM } from "./geocode";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const KEY = "server-key";

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

const PARIS = {
  place_id: "ChIJParis",
  formatted_address: "Paris, France",
  types: ["locality", "political"],
  geometry: { location: { lat: 48.8566, lng: 2.3522 } },
  address_components: [
    { long_name: "Paris", short_name: "Paris", types: ["locality", "political"] },
    { long_name: "Île-de-France", short_name: "IDF", types: ["administrative_area_level_1", "political"] },
    { long_name: "France", short_name: "FR", types: ["country", "political"] },
  ],
};

const SHIBUYA_ADDRESS = {
  place_id: "ChIJAddr",
  formatted_address: "1-22-7 Jinnan, Shibuya City, Tokyo 150-0041, Japan",
  types: ["street_address"],
  geometry: { location: { lat: 35.6614, lng: 139.7004 } },
  address_components: [
    { long_name: "Shibuya City", short_name: "Shibuya City", types: ["locality", "political"] },
    { long_name: "Japan", short_name: "JP", types: ["country", "political"] },
  ],
};

function venueDetails(lat: number, lng: number) {
  return {
    id: "ChIJVenue",
    location: { latitude: lat, longitude: lng },
    formattedAddress: "1F 1-22-7 Jinnan, Shibuya City, Tokyo 150-0041, Japan",
    addressComponents: [
      { longText: "Shibuya City", shortText: "Shibuya City", types: ["locality", "political"] },
      { longText: "Japan", shortText: "JP", types: ["country", "political"] },
    ],
  };
}

const FAIL = Symbol("fail");
type Reply = unknown | typeof FAIL;

function answer(body: Reply) {
  return body === FAIL ? { ok: false, status: 503, json: async () => ({}) } : ok(body);
}

function routeFetch(handlers: { geocode?: Reply; searchText?: Reply; details?: Reply }) {
  fetchMock.mockImplementation(async (input: string) => {
    const url = String(input);
    if (url.startsWith("https://maps.googleapis.com/maps/api/geocode/json")) return answer(handlers.geocode ?? { status: "ZERO_RESULTS", results: [] });
    if (url === "https://places.googleapis.com/v1/places:searchText") return answer(handlers.searchText ?? {});
    if (url.startsWith("https://places.googleapis.com/v1/places/")) return answer(handlers.details ?? {});
    throw new Error(`unexpected fetch ${url}`);
  });
}

function callsTo(prefix: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).startsWith(prefix));
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", KEY);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

describe("without a server key", () => {
  it("returns null and never fetches without a server key", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "");
    routeFetch({ geocode: { status: "OK", results: [PARIS] } });
    expect(await geocodePlaceDetailed("Paris")).toBeNull();
    expect(await reverseGeocode(48.8566, 2.3522)).toBeNull();
    expect(await locateVenue("Ichiran", "Shibuya")).toBeNull();
    expect(await fetchVenueDetails("ChIJVenue")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("geocodePlaceDetailed", () => {
  it("maps the first Geocoding result to a candidate with placeId, address and a lower-case country code", async () => {
    routeFetch({ geocode: { status: "OK", results: [PARIS, SHIBUYA_ADDRESS] } });
    expect(await geocodePlaceDetailed("Paris")).toEqual({
      name: "Paris",
      lat: 48.8566,
      lng: 2.3522,
      city: "Paris",
      country: "France",
      countryCode: "fr",
      region: "Île-de-France",
      placeId: "ChIJParis",
      address: "Paris, France",
    });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/geocode/json");
    expect(url.searchParams.get("address")).toBe("Paris");
    expect(url.searchParams.get("language")).toBe("en");
    expect(url.searchParams.get("key")).toBe(KEY);
  });

  it("has no region where Google gives no first-level area", async () => {
    routeFetch({ geocode: { status: "OK", results: [SHIBUYA_ADDRESS] } });
    expect((await geocodePlaceDetailed("1-22-7 Jinnan"))?.region).toBeNull();
  });

  it("names a non-locality by its full formatted address", async () => {
    routeFetch({ geocode: { status: "OK", results: [SHIBUYA_ADDRESS] } });
    const c = await geocodePlaceDetailed("1-22-7 Jinnan");
    expect(c?.name).toBe("1-22-7 Jinnan, Shibuya City, Tokyo 150-0041, Japan");
    expect(c?.city).toBe("Shibuya City");
    expect(c?.countryCode).toBe("jp");
  });

  it("bounds the search around near when given", async () => {
    routeFetch({ geocode: { status: "OK", results: [PARIS] } });
    await geocodePlaceDetailed("Paris", { near: { lat: 48, lng: 2 } });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("bounds")).toBe("47.5,1.5|48.5,2.5");
  });

  it("returns null on ZERO_RESULTS, a non-OK status, a non-2xx, malformed JSON, and a 5 s timeout", async () => {
    fetchMock.mockResolvedValueOnce(ok({ status: "ZERO_RESULTS", results: [] }));
    expect(await geocodePlaceDetailed("Nowhere")).toBeNull();

    fetchMock.mockResolvedValueOnce(ok({ status: "REQUEST_DENIED", results: [PARIS] }));
    expect(await geocodePlaceDetailed("Paris")).toBeNull();

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ status: "OK", results: [PARIS] }) });
    expect(await geocodePlaceDetailed("Paris")).toBeNull();

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } });
    expect(await geocodePlaceDetailed("Paris")).toBeNull();

    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect(await geocodePlaceDetailed("Paris")).toBeNull();

    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const pending = geocodePlaceDetailed("Paris");
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetchMock.mock.calls.at(-1)?.[1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();
  });
});

describe("lookUpPlace", () => {
  it("tells a miss from a failure", async () => {
    fetchMock.mockResolvedValueOnce(ok({ status: "OK", results: [PARIS] }));
    expect(await lookUpPlace("Paris")).toMatchObject({ status: "ok", candidate: { placeId: "ChIJParis" } });

    fetchMock.mockResolvedValueOnce(ok({ status: "ZERO_RESULTS", results: [] }));
    expect(await lookUpPlace("Nowhere")).toEqual({ status: "miss" });

    for (const status of ["OVER_QUERY_LIMIT", "OVER_DAILY_LIMIT", "REQUEST_DENIED", "UNKNOWN_ERROR"]) {
      fetchMock.mockResolvedValueOnce(ok({ status, results: [] }));
      expect(await lookUpPlace("Paris")).toEqual({ status: "error" });
    }

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    expect(await lookUpPlace("Paris")).toEqual({ status: "error" });

    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect(await lookUpPlace("Paris")).toEqual({ status: "error" });
  });

  it("an empty query is a miss and fetches nothing", async () => {
    expect(await lookUpPlace("  ")).toEqual({ status: "miss" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("reverseGeocode", () => {
  it("reverseGeocode reads latlng", async () => {
    routeFetch({ geocode: { status: "OK", results: [PARIS] } });
    const c = await reverseGeocode(48.8566, 2.3522);
    expect(c?.placeId).toBe("ChIJParis");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("latlng")).toBe("48.8566,2.3522");
    expect(url.searchParams.has("address")).toBe(false);
    expect(url.searchParams.get("language")).toBe("en");
  });
});

describe("locateVenue", () => {
  it("locateVenue asks Text Search for places.id only, then Place Details Essentials", async () => {
    routeFetch({
      geocode: { status: "OK", results: [SHIBUYA_ADDRESS] },
      searchText: { places: [{ id: "ChIJVenue" }, { id: "ChIJOther" }] },
      details: venueDetails(35.6615, 139.7005),
    });
    await locateVenue("Ichiran Shibuya", "1-22-7 Jinnan, Shibuya City");

    const [search] = callsTo("https://places.googleapis.com/v1/places:searchText");
    expect(search[1].method).toBe("POST");
    expect(search[1].headers).toMatchObject({ "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "places.id" });
    expect(JSON.parse(search[1].body)).toEqual({ textQuery: "Ichiran Shibuya, 1-22-7 Jinnan, Shibuya City" });

    const [details] = callsTo("https://places.googleapis.com/v1/places/ChIJVenue");
    expect(details[1].headers).toMatchObject({ "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "id,location,formattedAddress,addressComponents" });
    expect(callsTo("https://places.googleapis.com/v1/places/ChIJOther")).toHaveLength(0);
  });

  it("locateVenue accepts a venue within 0.5 km of the address", async () => {
    expect(VENUE_GUARD_KM).toBe(0.5);
    routeFetch({
      geocode: { status: "OK", results: [SHIBUYA_ADDRESS] },
      searchText: { places: [{ id: "ChIJVenue" }] },
      details: venueDetails(35.6630, 139.7010),
    });
    expect(await locateVenue("Ichiran Shibuya", "1-22-7 Jinnan, Shibuya City")).toEqual({
      name: "1F 1-22-7 Jinnan, Shibuya City, Tokyo 150-0041, Japan",
      lat: 35.663,
      lng: 139.701,
      city: "Shibuya City",
      country: "Japan",
      countryCode: "jp",
      region: null,
      placeId: "ChIJVenue",
      address: "1F 1-22-7 Jinnan, Shibuya City, Tokyo 150-0041, Japan",
      matched: "venue",
    });
  });

  it("locateVenue falls back to the address result when the venue is 2 km away", async () => {
    routeFetch({
      geocode: { status: "OK", results: [SHIBUYA_ADDRESS] },
      searchText: { places: [{ id: "ChIJVenue" }] },
      details: venueDetails(35.6794, 139.7004),
    });
    const c = await locateVenue("Ichiran", "1-22-7 Jinnan, Shibuya City");
    expect(c?.placeId).toBe("ChIJAddr");
    expect(c?.lat).toBe(35.6614);
    expect(c?.matched).toBe("address");
  });

  it("returns the address result when Text Search finds nothing, and null when both miss", async () => {
    routeFetch({ geocode: { status: "OK", results: [SHIBUYA_ADDRESS] }, searchText: {} });
    expect(await locateVenue("Nope", "1-22-7 Jinnan")).toMatchObject({ placeId: "ChIJAddr", matched: "address" });

    routeFetch({ geocode: { status: "ZERO_RESULTS", results: [] }, searchText: { places: [] } });
    expect(await locateVenue("Nope", "Nowhere")).toBeNull();
  });

  it("returns the venue unchecked when Google has no result for the address (ZERO_RESULTS)", async () => {
    routeFetch({
      geocode: { status: "ZERO_RESULTS", results: [] },
      searchText: { places: [{ id: "ChIJVenue" }] },
      details: venueDetails(35.6615, 139.7005),
    });
    expect(await locateVenue("Ichiran", "somewhere vague")).toMatchObject({ placeId: "ChIJVenue", matched: "venue" });
  });

  it("returns the venue unchecked when there is no address to check it against, without geocoding", async () => {
    routeFetch({ searchText: { places: [{ id: "ChIJVenue" }] }, details: venueDetails(35.6615, 139.7005) });
    expect(await locateVenue("Ichiran Shibuya", "  ")).toMatchObject({ placeId: "ChIJVenue", matched: "venue" });
    expect(callsTo("https://maps.googleapis.com/maps/api/geocode/json")).toHaveLength(0);
  });

  it.each([
    ["OVER_QUERY_LIMIT", { status: "OVER_QUERY_LIMIT", results: [] }],
    ["REQUEST_DENIED", { status: "REQUEST_DENIED", results: [] }],
    ["a 5xx", FAIL],
  ])("returns null, never the unchecked venue, when the address lookup fails with %s", async (_label, geocode) => {
    routeFetch({ geocode, searchText: { places: [{ id: "ChIJVenue" }] }, details: venueDetails(35.6615, 139.7005) });
    expect(await locateVenue("Ichiran", "1-22-7 Jinnan")).toBeNull();
    expect(await lookUpVenue("Ichiran", "1-22-7 Jinnan")).toEqual({ status: "error" });
  });

  it("returns null when the address lookup times out", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (input: string, init: { signal: AbortSignal }) => {
      const url = String(input);
      if (url.startsWith("https://maps.googleapis.com/maps/api/geocode/json")) {
        return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
      }
      if (url === "https://places.googleapis.com/v1/places:searchText") return ok({ places: [{ id: "ChIJVenue" }] });
      return ok(venueDetails(35.6615, 139.7005));
    });
    const pending = locateVenue("Ichiran", "1-22-7 Jinnan");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toBeNull();
  });

  it("a failed venue search is an error, not an address match", async () => {
    routeFetch({ geocode: { status: "OK", results: [SHIBUYA_ADDRESS] }, searchText: FAIL });
    expect(await lookUpVenue("Ichiran", "1-22-7 Jinnan")).toEqual({ status: "error" });
    expect(await locateVenue("Ichiran", "1-22-7 Jinnan")).toBeNull();
  });

  it("a venue whose Place Details fails is an error", async () => {
    routeFetch({ geocode: { status: "OK", results: [SHIBUYA_ADDRESS] }, searchText: { places: [{ id: "ChIJVenue" }] }, details: FAIL });
    expect(await lookUpVenue("Ichiran", "1-22-7 Jinnan")).toEqual({ status: "error" });
  });

  it("lookUpVenue says miss when neither the venue nor the address is found", async () => {
    routeFetch({ geocode: { status: "ZERO_RESULTS", results: [] }, searchText: {} });
    expect(await lookUpVenue("Nope", "Nowhere")).toEqual({ status: "miss" });
  });

  it("locateVenue biases to near when given", async () => {
    routeFetch({ geocode: { status: "OK", results: [SHIBUYA_ADDRESS] }, searchText: {} });
    await locateVenue("Ichiran", "Shibuya", { near: { lat: 35.66, lng: 139.7 } });
    const [search] = callsTo("https://places.googleapis.com/v1/places:searchText");
    expect(JSON.parse(search[1].body)).toEqual({
      textQuery: "Ichiran, Shibuya",
      locationBias: { circle: { center: { latitude: 35.66, longitude: 139.7 }, radius: 50000 } },
    });
  });
});

describe("fetchVenueDetails", () => {
  it("fetchVenueDetails asks for regularOpeningHours, websiteUri and businessStatus only", async () => {
    routeFetch({
      details: {
        id: "ChIJVenue",
        regularOpeningHours: { periods: [{ open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 22, minute: 0 } }] },
        websiteUri: "https://ichiran.com/",
        businessStatus: "OPERATIONAL",
      },
    });
    expect(await fetchVenueDetails("ChIJVenue")).toEqual({
      openingHours: {
        week: { sun: [], mon: [["11:00", "22:00"]], tue: [], wed: [], thu: [], fri: [], sat: [] },
        seasons: [],
        closed: [],
        source: "https://www.google.com/maps/search/?api=1&query=ChIJVenue&query_place_id=ChIJVenue",
      },
      website: "https://ichiran.com/",
      businessStatus: "OPERATIONAL",
    });
    const [[url, init]] = fetchMock.mock.calls;
    expect(String(url).split("?")[0]).toBe("https://places.googleapis.com/v1/places/ChIJVenue");
    expect(init.headers).toMatchObject({ "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "id,regularOpeningHours,websiteUri,businessStatus" });
  });

  it("returns null when Place Details fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    expect(await fetchVenueDetails("ChIJGone")).toBeNull();
  });
});
