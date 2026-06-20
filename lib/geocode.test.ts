import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodePlace } from "./geocode";

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
