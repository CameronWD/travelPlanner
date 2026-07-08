import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodePlace, searchPlaces, searchPlacesWithStatus, reverseGeocode } from "./geocode";

// Mock global fetch so we never hit the network.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  vi.clearAllMocks();
});

describe("geocodePlace", () => {
  it("returns lat/lng on a successful response", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: "48.8566", lon: "2.3522", display_name: "Paris, France" },
      ],
    });

    const result = await geocodePlace("Paris, France");

    expect(result).not.toBeNull();
    expect(result?.lat).toBeCloseTo(48.8566);
    expect(result?.lng).toBeCloseTo(2.3522);
  });

  it("returns null when the result array is empty", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const result = await geocodePlace("Nonexistent Place XYZ");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws a network error", async () => {
    fetchMock.mockRejectedValue(new Error("Network failure"));

    const result = await geocodePlace("Paris");
    expect(result).toBeNull();
  });

  it("returns null when the HTTP response is not ok", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => [],
    });

    const result = await geocodePlace("Paris");
    expect(result).toBeNull();
  });

  it("returns null when the response JSON is not an array", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ error: "something went wrong" }),
    });

    const result = await geocodePlace("Paris");
    expect(result).toBeNull();
  });

  it("passes the correct User-Agent header", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "48.8566", lon: "2.3522" }],
    });

    await geocodePlace("Paris");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["User-Agent"]).toMatch(/TripPlanner/);
  });

  it("includes the query in the URL", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "51.5074", lon: "-0.1278" }],
    });

    await geocodePlace("London, UK");

    const [url] = fetchMock.mock.calls[0];
    // URLSearchParams encodes spaces as '+', decode that too
    expect(decodeURIComponent((url as string).replace(/\+/g, " "))).toContain("London, UK");
  });
});

describe("searchPlaces", () => {
  it("maps candidates with derived city/country/countryCode", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          display_name: "Tokyo Tower, Minato, Tokyo, Japan",
          lat: "35.6586",
          lon: "139.7454",
          address: { city: "Tokyo", country: "Japan", country_code: "jp" },
        },
      ],
    });

    const results = await searchPlaces("Tokyo Tower");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      name: "Tokyo Tower, Minato, Tokyo, Japan",
      city: "Tokyo",
      country: "Japan",
      countryCode: "jp",
    });
    expect(results[0].lat).toBeCloseTo(35.6586);
    expect(results[0].lng).toBeCloseTo(139.7454);
  });

  it("falls back through town/village when city is absent", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          display_name: "Hallstatt, Austria",
          lat: "47.56",
          lon: "13.64",
          address: { village: "Hallstatt", country: "Austria", country_code: "at" },
        },
      ],
    });
    const results = await searchPlaces("Hallstatt");
    expect(results[0].city).toBe("Hallstatt");
  });

  it("returns [] on empty result, non-ok, or network error", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    expect(await searchPlaces("nowhere")).toEqual([]);

    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => [] });
    expect(await searchPlaces("paris")).toEqual([]);

    fetchMock.mockRejectedValue(new Error("network"));
    expect(await searchPlaces("paris")).toEqual([]);
  });
});

describe("reverseGeocode", () => {
  it("maps a reverse hit to a GeoCandidate", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: "Eiffel Tower, Paris, France",
        lat: "48.8584",
        lon: "2.2945",
        address: { city: "Paris", country: "France", country_code: "fr" },
      }),
    });
    const result = await reverseGeocode(48.8584, 2.2945);
    expect(result).toMatchObject({ name: "Eiffel Tower, Paris, France", city: "Paris", countryCode: "fr" });
  });

  it("returns null on error / no address", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect(await reverseGeocode(0, 0)).toBeNull();

    fetchMock.mockRejectedValue(new Error("network"));
    expect(await reverseGeocode(0, 0)).toBeNull();
  });
});

describe("searchPlacesWithStatus", () => {
  it("returns status 'ok' with candidates on a successful response", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          display_name: "Tokyo Tower, Minato, Tokyo, Japan",
          lat: "35.6586",
          lon: "139.7454",
          address: { city: "Tokyo", country: "Japan", country_code: "jp" },
        },
      ],
    });
    const res = await searchPlacesWithStatus("Tokyo Tower");
    expect(res.status).toBe("ok");
    expect(res.status === "ok" && res.candidates).toHaveLength(1);
  });

  it("returns status 'ok' with an empty array when there are no matches", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    const res = await searchPlacesWithStatus("nowhere-xyz");
    expect(res).toEqual({ status: "ok", candidates: [] });
  });

  it("returns status 'error' when the HTTP response is not ok (e.g. 403)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const res = await searchPlacesWithStatus("paris");
    expect(res).toEqual({ status: "error" });
  });

  it("returns status 'error' when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const res = await searchPlacesWithStatus("paris");
    expect(res).toEqual({ status: "error" });
  });

  it("returns status 'error' when the JSON is not an array", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ error: "x" }) });
    const res = await searchPlacesWithStatus("paris");
    expect(res).toEqual({ status: "error" });
  });

  it("never sends the blocklisted example.com contact in the User-Agent", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    await searchPlacesWithStatus("paris");
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["User-Agent"]).toMatch(/TripPlanner/);
    expect(options.headers["User-Agent"]).not.toContain("example.com");
  });
});
